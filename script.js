import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfvjCTLW8Fw0tv4KvTSHGLIAmsmLWZJbE",
  authDomain: "sketch-ai-5bee5.firebaseapp.com",
  projectId: "sketch-ai-5bee5",
  storageBucket: "sketch-ai-5bee5.firebasestorage.app",
  messagingSenderId: "854561021608",
  appId: "1:854561021608:web:d7f031013eb20de406ec9d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let isSyncing = false;

//  DATA & STATE
// ══════════════════════════════════════

let apiKey = localStorage.getItem('sketch_gemini_api_key') || '';
let groqApiKey = localStorage.getItem('sketch_groq_api_key') || '';
let selectedProvider = localStorage.getItem('sketch_provider') || 'gemini';
let challenges = JSON.parse(localStorage.getItem('sketch_challenges') || '[]');

// Initial seeds if no challenges exist
if (challenges.length === 0) {
  challenges = [
    {
      id: 'c_start_1', icon: '🌿', title: "7 Days of Texture",
      description: "Draw one object focusing entirely on its surface. Rough, smooth, cracked, soft.",
      skill: "Observational Accuracy", level: "gentle", duration: "~10 min/session",
      completionQuote: "You've learned to feel surfaces with your eyes.",
      notifyMessages: [
        { title: "Your sketchbook is waiting.", body: "Pick an object and study its surface for 10 minutes." }
      ]
    }
  ];
  localStorage.setItem('sketch_challenges', JSON.stringify(challenges));
}

let currentFilter = 'all';
let currentIdea = null;
let ideaCount = 0;
let savedIdeas = JSON.parse(localStorage.getItem('sketch_saved') || '[]');
let streak = JSON.parse(localStorage.getItem('sketch_streak') || '{"days":[],"count":0}');
let timerMins = 5, timerSecs = 0, timerInterval = null, timerRunning = false;
let generatedToday = false;
let activeChallenge = JSON.parse(localStorage.getItem('sketch_active_challenge') || 'null');
let completedChallenges = JSON.parse(localStorage.getItem('sketch_completed_challenges') || '[]');
let challengeNotifyEnabled = JSON.parse(localStorage.getItem('sketch_challenge_notify') || 'false');
let notifyTimers = [];

const completionQuotes = [
  "Every finished challenge is a quiet revolution against the blank page.",
  "The discipline of completing things is the hardest skill to draw.",
  "You showed up. That's the whole practice.",
  "Art isn't made in inspiration — it's made in commitment.",
  "One more challenge down. Your eye is sharper for it.",
];

const footerQuotes = [
  '"Drawing is not what one sees, but what one can make others see." — Degas',
  '"Every artist was first an amateur." — Emerson',
  '"The painter has the Universe in his mind and hands." — da Vinci',
  '"To draw, you must close your eyes and sing." — Picasso',
  '"The job of the artist is always to deepen the mystery." — Francis Bacon',
  '"Art washes away from the soul the dust of everyday life." — Picasso',
  '"Creativity takes courage." — Matisse',
  '"The object of art is not to reproduce reality, but to create a reality of the same intensity." — Giacometti'
];

// ══════════════════════════════════════
//  GEMINI API UTILITY
// ══════════════════════════════════════

async function callGemini(systemPrompt, userPrompt) {
  if (!apiKey) {
    toggleSettings(true);
    throw new Error('API Key missing');
  }

  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-001',
    'gemini-1.5-pro',
    'gemini-pro'
  ];

  let lastError = null;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Request: ${userPrompt}` }]
          }],
          generationConfig: {
            response_mime_type: "application/json",
          }
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: "Unknown API error" } }));
        const msg = err.error?.message || 'API Call Failed';
        
        // If model not found, try the next one in the list
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('not supported')) {
          console.warn(`Model ${model} not found, trying fallback...`);
          lastError = msg;
          continue; 
        }

        if (msg.toLowerCase().includes('api key')) {
          localStorage.removeItem('sketch_gemini_api_key');
          apiKey = '';
          toggleSettings(true);
        }
        throw new Error(msg);
      }

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) throw new Error("No response from AI. Try a different prompt.");

      // Clean up potential markdown wrapping
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(text);

    } catch (e) {
      // If it's a model-not-found error we already 'continued', 
      // but if it's a fetch/network error, we throw.
      if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
        throw new Error("Network error or CORS block. Ensure your API Key is unrestricted for localhost testing.");
      }
      if (lastError && (lastError.includes('not found') || lastError.includes('not supported'))) {
         // already handled by continue
      } else {
        throw e;
      }
    }
  }

  throw new Error(lastError || "All models failed or were not found.");
}

function logDebug(msg) {
  const log = document.getElementById('debugLog');
  const content = document.getElementById('debugLogContent');
  if (log && content) {
    log.classList.add('show');
    content.textContent = msg;
  }
}

async function validateApiKey() {
  const btn = document.querySelector('.btn-validate');
  if (btn) btn.classList.add('loading');
  logDebug("Validating key...");
  try {
    const res = await callGemini("Return {\"status\":\"ok\"}", "test");
    if (res.status === 'ok') {
      showToast("API Key validated! ✓");
      document.getElementById('debugLog').classList.remove('show');
    }
  } catch (e) {
    showToast(`Validation failed`);
    logDebug(e.message);
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

// ══════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════

function toggleSettings(show) {
  const modal = document.getElementById('settingsModal');
  if (show) {
    document.getElementById('apiKeyInput').value = apiKey;
    document.getElementById('groqApiKeyInput').value = groqApiKey;
    setProvider(selectedProvider);
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
  } else {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
}

function setProvider(p) {
  selectedProvider = p;
  document.getElementById('pillGemini').classList.toggle('active', p === 'gemini');
  document.getElementById('pillGroq').classList.toggle('active', p === 'groq');
  document.getElementById('geminiSettings').style.display = p === 'gemini' ? 'block' : 'none';
  document.getElementById('groqSettings').style.display = p === 'groq' ? 'block' : 'none';
  // Hide debug log when switching
  document.getElementById('debugLog').classList.remove('show');
}

function saveSettings() {
  apiKey = document.getElementById('apiKeyInput').value.trim();
  groqApiKey = document.getElementById('groqApiKeyInput').value.trim();
  
  localStorage.setItem('sketch_gemini_api_key', apiKey);
  localStorage.setItem('sketch_groq_api_key', groqApiKey);
  localStorage.setItem('sketch_provider', selectedProvider);
  
  syncToCloud();
  toggleSettings(false);
  showToast('Settings saved ✓');
}

// ══════════════════════════════════════
//  FIREBASE AUTH & SYNC
// ══════════════════════════════════════

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  const authContainer = document.getElementById('userAuth');
  if (user) {
    // Logged In
    authContainer.innerHTML = `
      <div class="user-profile" onclick="logout()">
        <img class="user-avatar" src="${user.photoURL}" alt="${user.displayName}" title="Click to logout">
        <span class="sync-status synced" id="syncIndicator"></span>
      </div>
    `;
    await loadFromCloud();
  } else {
    // Logged Out
    authContainer.innerHTML = `
      <button class="btn-login" id="btnLogin" onclick="loginWithGoogle()">
        <img src="https://www.google.com/favicon.ico" alt="Google">
        Login
      </button>
    `;
  }
});

async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    showToast(`Welcome, ${result.user.displayName}!`);
  } catch (error) {
    console.error("Login Error:", error);
    console.log("Current Domain:", window.location.hostname);
    // Show detailed error for debugging
    showToast(`Login failed: ${error.message} (Domain: ${window.location.hostname})`);
  }
}

async function logout() {
  if (confirm("Logout from Sketch? Your data will remain on this device.")) {
    await signOut(auth);
    showToast("Logged out");
    location.reload(); // Refresh to clean state
  }
}

async function syncToCloud() {
  if (!currentUser) return;
  
  const indicator = document.getElementById('syncIndicator');
  if (indicator) {
    indicator.classList.remove('synced');
    indicator.classList.add('saving');
  }

  try {
    const data = {
      apiKeys: { gemini: apiKey, groq: groqApiKey, provider: selectedProvider },
      challenges,
      savedIdeas,
      activeChallenge,
      completedChallenges,
      streak,
      lastUpdated: new Date().toISOString()
    };
    
    await setDoc(doc(db, "users", currentUser.uid), data, { merge: true });
    
    if (indicator) {
      indicator.classList.remove('saving');
      indicator.classList.add('synced');
    }
  } catch (error) {
    console.error("Sync Error:", error);
    // Silent fail if Firestore isn't setup yet
  }
}

async function loadFromCloud() {
  if (!currentUser || isSyncing) return;
  isSyncing = true;

  try {
    const docRef = doc(db, "users", currentUser.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const cloudData = docSnap.data();
      
      // Merge logic: Simple overwrite local with cloud for this version
      if (cloudData.apiKeys) {
        apiKey = cloudData.apiKeys.gemini || apiKey;
        groqApiKey = cloudData.apiKeys.groq || groqApiKey;
        selectedProvider = cloudData.apiKeys.provider || selectedProvider;
      }
      
      challenges = cloudData.challenges || challenges;
      savedIdeas = cloudData.savedIdeas || savedIdeas;
      activeChallenge = cloudData.activeChallenge || activeChallenge;
      completedChallenges = cloudData.completedChallenges || completedChallenges;
      streak = cloudData.streak || streak;

      // Update LocalStorage to match cloud
      localStorage.setItem('sketch_gemini_api_key', apiKey);
      localStorage.setItem('sketch_groq_api_key', groqApiKey);
      localStorage.setItem('sketch_provider', selectedProvider);
      localStorage.setItem('sketch_challenges', JSON.stringify(challenges));
      localStorage.setItem('sketch_saved', JSON.stringify(savedIdeas));
      activeChallenge = null;
      localStorage.setItem('sketch_active_challenge', 'null');
      localStorage.setItem('sketch_completed_challenges', JSON.stringify(completedChallenges));
      syncToCloud();
      updateChallengeGrid();
      localStorage.setItem('sketch_streak', JSON.stringify(streak));

      // Refresh UI (Optional: selectively refresh if needed)
      init(); 
      updateSavedGrid();
      updateChallengeGrid();
      updateGenCount();
    }
  } catch (error) {
    console.error("Load Error:", error);
  } finally {
    isSyncing = false;
  }
}

// Expose functions to window for HTML onclick attributes
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;
window.toggleSettings = toggleSettings;
window.setProvider = setProvider;
window.saveSettings = saveSettings;
window.validateApiKey = validateApiKey;
window.generateIdea = generateIdea;
window.saveIdea = saveIdea;
window.removeSavedIdea = removeSavedIdea;
window.setFilter = setFilter;
window.commitChallenge = commitChallenge;
window.abandonChallenge = abandonChallenge;
window.completeChallenge = completeChallenge;
window.toggleChallengeNotify = toggleChallengeNotify;
window.closeCelebration = closeCelebration;
window.generateAIPrompt = generateAIPrompt;


// ══════════════════════════════════════
//  AI DISPATCHER
// ══════════════════════════════════════

async function callAI(systemPrompt, userPrompt) {
  if (selectedProvider === 'gemini') {
    return await callGemini(systemPrompt, userPrompt);
  } else {
    return await callGroq(systemPrompt, userPrompt);
  }
}

async function callGroq(systemPrompt, userPrompt) {
  if (!groqApiKey) {
    toggleSettings(true);
    throw new Error('Groq API Key missing');
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: "Groq API error" } }));
      throw new Error(err.error?.message || 'Groq Call Failed');
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
      throw new Error("Network error. Please check your internet connection.");
    }
    throw e;
  }
}


// ══════════════════════════════════════
//  INIT & STREAK
// ══════════════════════════════════════

async function init() {
  console.log("Initializing Sketch v2.3...");
  const now = new Date();
  
  const dateEl = document.getElementById('todayDate');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  
  const quoteEl = document.getElementById('footerQuote');
  if (quoteEl) {
    // 🎨 Immediate quote on load (Zero waiting)
    quoteEl.textContent = footerQuotes[Math.floor(Math.random() * footerQuotes.length)];
    
    // 🧠 Background upgrade to AI quote if possible
    if (apiKey || groqApiKey) {
      setTimeout(() => fetchAIQuote(), 100); 
    }
  }
  
  renderStreak();
  renderChallengeBadge();
  
  if (activeChallenge && challengeNotifyEnabled && Notification.permission === 'granted') {
    scheduleNotifications();
  }
  
  if (!apiKey) {
    setTimeout(() => toggleSettings(true), 1000);
  }
}


async function fetchAIQuote() {
  const quoteEl = document.getElementById('footerQuote');
  try {
    const sys = "You are a poetic curator of art history. Provide a single, short, evocative quote about the soul of drawing or the beauty of creation. It can be from a famous artist or your own original thought. Format as JSON: { \"quote\": \"the quote\", \"author\": \"name\" }";
    const user = "Give me one inspiring sentence to start my drawing session.";
    const resp = await callAI(sys, user);
    if (resp && resp.quote) {
      quoteEl.style.opacity = 0;
      setTimeout(() => {
        quoteEl.textContent = `"${resp.quote}" — ${resp.author || 'Inspiration'}`;
        quoteEl.style.opacity = 1;
      }, 300);
    }
  } catch (e) {
    console.error("AI Quote failed:", e);
    // Silent fallback to array
    quoteEl.textContent = footerQuotes[Math.floor(Math.random() * footerQuotes.length)];
  }
}




function renderStreak() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayDow = (new Date().getDay() + 6) % 7;
  let html = '';
  for (let i = 0; i < 7; i++) {
    let cls = 's-dot';
    if (i < todayDow) cls += streak.days.includes(i) ? ' done' : '';
    if (i === todayDow) cls += generatedToday ? ' done today' : ' today';
    html += `<div class="${cls}" title="${days[i]}"></div>`;
  }
  document.getElementById('streakDots').innerHTML = html;
  document.getElementById('streakCount').innerHTML = `<span>${streak.count}</span> day streak`;
}

function updateStreak() {
  const todayDow = (new Date().getDay() + 6) % 7;
  if (!streak.days.includes(todayDow)) {
    streak.days.push(todayDow);
    streak.count = Math.min(streak.count + 1, 7);
    localStorage.setItem('sketch_streak', JSON.stringify(streak));
  }
  renderStreak();
}

// ══════════════════════════════════════
//  TABS & GENERATE
// ══════════════════════════════════════

function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('generatePanel').style.display = tab === 'generate' ? 'block' : 'none';
  document.getElementById('filterBar').style.display = tab === 'generate' ? 'flex' : 'none';
  document.getElementById('challengePanel').classList.toggle('open', tab === 'challenge');
  document.getElementById('savedPanel').classList.toggle('open', tab === 'saved');
  document.getElementById('aiPanel').classList.toggle('open', tab === 'ai');
  if (tab === 'challenge') renderChallengePanel();
  if (tab === 'saved') renderSaved();
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function generateIdea() {
  const btn = document.getElementById('generateBtn');
  if (btn.classList.contains('loading')) return;

  btn.classList.add('loading');
  ['ideaTitle', 'ideaTagline', 'ideaTags', 'ideaImageWrapper', 'breakdown', 'timerRow'].forEach(id => document.getElementById(id).classList.remove('show'));

  try {
    const systemPrompt = `You are a creative drawing prompt generator. Generate a unique, poetic, and inspiring drawing prompt in JSON format.
    Return a single JSON object with:
    {
      "title": "short title",
      "tagline": "poetic description",
      "tags": ["theme", "difficulty"],
      "steps": ["step 1", "step 2", "step 3", "step 4"]
    }`;

    const userPrompt = `Generate a drawing idea focused on the theme: ${currentFilter}. Ensure it feels like a discovery. Include one difficulty tag: easy, medium, or hard.`;

    const pick = await callAI(systemPrompt, userPrompt);

    
    currentIdea = pick; ideaCount++; generatedToday = true;
    updateGenCount(); updateStreak();

    document.getElementById('emptyHint').style.display = 'none';
    document.getElementById('ideaDisplay').style.display = 'block';
    document.getElementById('cardArea').classList.add('has-content');
    document.getElementById('actionRow').classList.remove('no-content');
    document.getElementById('saveBtn').style.display = 'flex';
    document.getElementById('timerToggle').style.display = 'block';

    document.getElementById('ideaNumber').textContent = String(ideaCount).padStart(2, '0');
    document.getElementById('ideaTitle').textContent = pick.title;
    document.getElementById('ideaTagline').textContent = pick.tagline;

    const tagsEl = document.getElementById('ideaTags');
    const diff = pick.tags.find(t => ['easy', 'medium', 'hard'].includes(t)) || 'medium';
    const themeTag = pick.tags.find(t => !['easy', 'medium', 'hard'].includes(t)) || currentFilter;
    tagsEl.innerHTML = `<span class="tag">${themeTag}</span><span class="tag difficulty-${diff}">${diff}</span>`;

    document.getElementById('breakdownSteps').innerHTML = pick.steps.map((s, i) =>
      `<div class="step"><span class="step-num">${String(i + 1).padStart(2, '0')}.</span><span class="step-text">${s}</span></div>`
    ).join('');

    const imgWrapper = document.getElementById('ideaImageWrapper');
    imgWrapper.style.display = 'flex'; imgWrapper.classList.remove('loaded');
    document.getElementById('ideaImage').src = `https://image.pollinations.ai/prompt/${encodeURIComponent('A beautiful pencil sketch drawing of ' + pick.title + ' ' + pick.tagline + ' high sketch quality simple lines')}?width=800&height=450&nologo=true`;

    const saveBtn = document.getElementById('saveBtn');
    const already = savedIdeas.some(s => s.title === pick.title);
    saveBtn.classList.toggle('saved', already);
    saveBtn.textContent = already ? '♥' : '♡';

    setTimeout(() => document.getElementById('ideaTitle').classList.add('show'), 50);
    setTimeout(() => document.getElementById('ideaTagline').classList.add('show'), 150);
    setTimeout(() => tagsEl.classList.add('show'), 250);
    setTimeout(() => document.getElementById('ideaImageWrapper').classList.add('show'), 300);
    setTimeout(() => document.getElementById('breakdown').classList.add('show'), 350);
    setTimeout(() => document.getElementById('timerRow').classList.add('show'), 450);

  } catch (e) {
    if (e.message !== 'API Key missing') {
      showToast(`Generation failed: ${e.message}`);
      console.error(e);
    }
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="spin">↺</span> Next';
    if (timerRunning) stopTimer();
    updateTimerDisplay();
  }
}

function updateGenCount() {
  document.getElementById('genCount').textContent = ideaCount > 0 ? `${ideaCount} idea${ideaCount > 1 ? 's' : ''} generated` : '';
}

// ══════════════════════════════════════
//  SAVED & TIMER & NOTIFICATIONS (SAME LOGIC)
// ══════════════════════════════════════

function saveIdea() {
  if (!currentIdea) return;
  const btn = document.getElementById('saveBtn');
  const already = savedIdeas.some(s => s.title === currentIdea.title);
  if (already) {
    savedIdeas = savedIdeas.filter(s => s.title !== currentIdea.title);
    btn.textContent = '♡'; btn.classList.remove('saved'); showToast('Removed from saved');
  } else {
    savedIdeas.unshift({ ...currentIdea, savedAt: new Date().toISOString() });
    savedIdeas.push({ ...pick, id: 'i_' + Date.now(), date: new Date().toLocaleDateString() });
    localStorage.setItem('sketch_saved', JSON.stringify(savedIdeas));
    syncToCloud();
    showToast("Idea saved to your collection! ✓");
  }
  localStorage.setItem('sketch_saved', JSON.stringify(savedIdeas));
}

function renderSaved() {
  const el = document.getElementById('savedList');
  if (!savedIdeas.length) {
    el.innerHTML = '<div class="empty-saved"><span class="big">♡</span>No saved ideas yet.<br>Generate and save the ones that spark something.</div>'; return;
  }
  el.innerHTML = '<div class="saved-grid">' + savedIdeas.map((idea, i) => `
    <div class="saved-item" onclick="loadSaved(${i})">
      <div><div class="saved-item-title">${idea.title}</div><div class="saved-item-meta">${idea.tags.join(' · ')}</div></div>
      <button class="saved-item-remove" onclick="event.stopPropagation();removeSaved(${i})">✕</button>
    </div>`).join('') + '</div>';
}

function loadSaved(idx) {
  currentIdea = savedIdeas[idx];
  switchTab('generate', document.querySelectorAll('.tab-btn')[0]);
  ideaCount++; updateGenCount();

  const cardArea = document.getElementById('cardArea');
  const ideaDisplay = document.getElementById('ideaDisplay');
  const emptyHint = document.getElementById('emptyHint');
  const actionRow = document.getElementById('actionRow');
  document.getElementById('saveBtn').style.display = 'flex';
  document.getElementById('timerToggle').style.display = 'block';
  emptyHint.style.display = 'none';
  ideaDisplay.style.display = 'block';
  cardArea.classList.add('has-content');
  actionRow.classList.remove('no-content');
  document.getElementById('ideaNumber').textContent = String(ideaCount).padStart(2, '0');
  ['ideaTitle', 'ideaTagline', 'ideaTags', 'ideaImageWrapper', 'breakdown', 'timerRow'].forEach(id => document.getElementById(id).classList.remove('show'));
  setTimeout(() => {
    document.getElementById('ideaTitle').textContent = currentIdea.title;
    document.getElementById('ideaTagline').textContent = currentIdea.tagline;
    const tagsEl = document.getElementById('ideaTags');
    const diff = currentIdea.tags.find(t => ['easy', 'medium', 'hard'].includes(t));
    const theme = currentIdea.tags.find(t => !['easy', 'medium', 'hard'].includes(t));
    tagsEl.innerHTML = '';
    if (theme) tagsEl.innerHTML += `<span class="tag">${theme}</span>`;
    if (diff) tagsEl.innerHTML += `<span class="tag difficulty-${diff}">${diff}</span>`;
    document.getElementById('breakdownSteps').innerHTML = currentIdea.steps.map((s, i) =>
      `<div class="step"><span class="step-num">${String(i + 1).padStart(2, '0')}.</span><span class="step-text">${s}</span></div>`).join('');
    
    const imgWrapper = document.getElementById('ideaImageWrapper');
    imgWrapper.style.display = 'flex'; imgWrapper.classList.remove('loaded');
    document.getElementById('ideaImage').src = `https://image.pollinations.ai/prompt/${encodeURIComponent('A beautiful pencil sketch drawing of ' + currentIdea.title + ' ' + currentIdea.tagline + ' high sketch quality simple lines')}?width=800&height=450&nologo=true`;

    setTimeout(() => document.getElementById('ideaTitle').classList.add('show'), 50);
    setTimeout(() => document.getElementById('ideaTagline').classList.add('show'), 150);
    setTimeout(() => tagsEl.classList.add('show'), 250);
    setTimeout(() => document.getElementById('ideaImageWrapper').classList.add('show'), 300);
    setTimeout(() => document.getElementById('breakdown').classList.add('show'), 350);
    setTimeout(() => document.getElementById('timerRow').classList.add('show'), 450);
  }, 50);
}

function removeSavedIdea(id) {
  savedIdeas = savedIdeas.filter(i => i.id !== id);
  localStorage.setItem('sketch_saved', JSON.stringify(savedIdeas));
  syncToCloud();
  updateSavedGrid();
  showToast("Idea removed");
}


function setTime(mins, btn) {
  document.querySelectorAll('.time-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); timerMins = mins; timerSecs = 0;
  if (timerRunning) stopTimer(); updateTimerDisplay();
}

function updateTimerDisplay() {
  document.getElementById('timerDisplay').textContent = `${String(timerMins).padStart(2, '0')}:${String(timerSecs).padStart(2, '0')}`;
}

function toggleTimer() { timerRunning ? stopTimer() : startTimer(); }

function startTimer() {
  timerRunning = true;
  document.getElementById('timerToggle').textContent = 'Stop';
  document.getElementById('timerToggle').classList.add('active');
  document.getElementById('timerDisplay').classList.add('running');
  timerInterval = setInterval(() => {
    if (timerSecs === 0) { if (timerMins === 0) { stopTimer(); showToast("Time's up! ✓"); return; } timerMins--; timerSecs = 59; } else { timerSecs--; }
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval); timerRunning = false;
  document.getElementById('timerToggle').textContent = 'Start timer';
  document.getElementById('timerToggle').classList.remove('active');
  document.getElementById('timerDisplay').classList.remove('running');
}

// ══════════════════════════════════════
//  CHALLENGES (AI ADAPTIVE)
// ══════════════════════════════════════

function renderChallengePanel() {
  const card = document.getElementById('activeChallengeCard');
  if (activeChallenge) {
    const ch = challenges.find(c => c.id === activeChallenge.id);
    if (ch) {
      document.getElementById('accTitle').textContent = ch.title;
      document.getElementById('accTagline').textContent = ch.description;
      document.getElementById('accSkill').textContent = ch.skill + ' · ' + ch.duration;
      card.classList.add('show');
      updateNotifyUI();
    }
  } else {
    card.classList.remove('show');
  }
  renderChallengeGrid();
  renderCompletedChallenges();
}

function renderChallengeGrid() {
  const grid = document.getElementById('challengeGrid');
    grid.innerHTML = challenges.map(ch => {
    const isActive = activeChallenge && activeChallenge.id === ch.id;
    const isDone = completedChallenges.some(c => c.id === ch.id);
    const clickable = !isActive && !isDone;
    return `
      <div class="challenge-card${isActive ? ' committed' : ''}${isDone ? ' done-card' : ''}" ${clickable ? `onclick="commitChallenge('${ch.id}')"` : ''}>
        <span class="cc-icon">${ch.icon}</span>
        <div class="cc-title">${ch.title}</div>
        <div class="cc-desc">${ch.description}</div>
        <div class="cc-meta">
          <span class="cc-tag level-${ch.level}">${ch.level}</span>
          <span class="cc-tag">${ch.skill}</span>
        </div>
        ${clickable ? `<button class="cc-commit-btn" onclick="event.stopPropagation();commitChallenge('${ch.id}')">Commit →</button>` : ''}
        ${isActive ? `<button class="cc-commit-btn active-btn">Active ✦</button>` : ''}
        ${isDone ? `<button class="cc-commit-btn done-btn" disabled>Done ✓</button>` : ''}
      </div>`;
  }).join('');
}

function renderCompletedChallenges() {
  const list = document.getElementById('completedList');
  if (!completedChallenges.length) { document.getElementById('completedSection').style.display = 'none'; return; }
  document.getElementById('completedSection').style.display = 'block';
  list.innerHTML = completedChallenges.map(c => `
    <div class="completed-row"><div><div class="completed-title">${c.title}</div><div class="completed-date">Done ${new Date(c.completedAt).toLocaleDateString()}</div></div><span class="completed-badge">✓</span></div>
  `).join('');
}

function renderChallengeBadge() {
  document.getElementById('challengeBadge').classList.toggle('show', !!activeChallenge);
}

function commitChallenge(id) {
  if (activeChallenge) { showToast('One at a time!'); return; }
  const ch = challenges.find(c => c.id === id);
  if (!ch) return;
  activeChallenge = { id, title: ch.title, committedAt: Date.now() };
  localStorage.setItem('sketch_active_challenge', JSON.stringify(activeChallenge));
  renderChallengeBadge();
  renderChallengePanel();
}

async function completeChallenge() {
  if (!activeChallenge) return;
  const ch = challenges.find(c => c.id === activeChallenge.id);
  completedChallenges.unshift({ id: ch.id, title: ch.title, completedAt: Date.now() });
  localStorage.setItem('sketch_completed_challenges', JSON.stringify(completedChallenges));
  
  const oldId = activeChallenge.id;
  activeChallenge = null;
  localStorage.removeItem('sketch_active_challenge');
  generatedToday = true; updateStreak();
  clearNotifyTimers();
  showCelebration(ch);
  renderChallengeBadge();
  
  // Adaptive AI generation for the NEXT challenge
  try {
    const history = completedChallenges.slice(0, 3).map(c => c.title).join(', ');
    const interests = savedIdeas.slice(0, 3).map(i => i.title).join(', ');
    
    const systemPrompt = `You are a personalized art coach. Based on the user's history and interests, generate ONE new drawing challenge in JSON format.
    Return a single JSON object with:
    {
      "id": "unique_id",
      "icon": "emoji",
      "title": "Challenge Title",
      "description": "Task description",
      "skill": "skill focused",
      "level": "gentle, moderate, or stretch",
      "duration": "~X min/session",
      "completionQuote": "Inspirational quote",
      "notifyMessages": [{"title": "t", "body": "b"}]
    }`;

    const userPrompt = `History: ${history}. Interests: ${interests}. Generate something that pushes them further but stays in line with their tastes.`;
    
    const newChallenge = await callAI(systemPrompt, userPrompt);

    challenges.push(newChallenge);
    localStorage.setItem('sketch_challenges', JSON.stringify(challenges));
    showToast('New adaptive challenge added!');
  } catch(e) {
    console.error('Adaptive challenge fail', e);
  }
}

function abandonChallenge() {
  activeChallenge = null;
  localStorage.removeItem('sketch_active_challenge');
  renderChallengeBadge();
  renderChallengePanel();
}

function showCelebration(ch) {
  document.getElementById('celebrationTitle').textContent = `"${ch.title}"`;
  document.getElementById('celebrationSub').textContent = ch.completionQuote;
  document.getElementById('celebrationQuote').textContent = completionQuotes[Math.floor(Math.random() * completionQuotes.length)];
  document.getElementById('celebrationOverlay').classList.add('show');
}

function closeCelebration() {
  document.getElementById('celebrationOverlay').classList.remove('show');
  renderChallengePanel();
}

// ══════════════════════════════════════
//  NOTIFICATIONS & TOAST (SAME)
// ══════════════════════════════════════

async function requestNotifyPermission() {
  if (!('Notification' in window)) { showToast('Not supported'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    challengeNotifyEnabled = true;
    localStorage.setItem('sketch_challenge_notify', 'true');
    updateNotifyUI();
  }
}

function toggleChallengeNotify() {
  challengeNotifyEnabled = !challengeNotifyEnabled;
  localStorage.setItem('sketch_challenge_notify', JSON.stringify(challengeNotifyEnabled));
  updateNotifyUI();
}

function updateNotifyUI() {
  const on = challengeNotifyEnabled && Notification.permission === 'granted';
  const btn = document.getElementById('notifyToggleBtn');
  if(btn) btn.innerHTML = on ? '🔔 Reminders on' : '🔔 Remind me';
}

function clearNotifyTimers() {
  notifyTimers.forEach(t => clearTimeout(t));
  notifyTimers = [];
}

function scheduleNotifications() {}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ══════════════════════════════════════
//  AI CHAT (REFACTOR TO GEMINI)
// ══════════════════════════════════════

async function askAI() {
  const input = document.getElementById('aiInput').value.trim();
  if (!input) return;
  const thinking = document.getElementById('aiThinking');
  const result = document.getElementById('aiResult');
  const btn = document.getElementById('aiBtn');
  
  thinking.classList.add('show');
  result.classList.remove('show');
  btn.classList.add('loading');

  try {
    const sys = "You are a poetic drawing guide. Provide a single, evocative drawing prompt based on the user's mood or request. Respond with a JSON object: { \"text\": \"your prompt here\" }";
    const resp = await callAI(sys, input);
    result.textContent = resp.text || "I couldn't quite find the right inspiration. Try again?";

    result.classList.add('show');
  } catch (e) {
    if (e.message !== 'API Key missing') {
      showToast('AI thinking failed');
      console.error(e);
    }
  } finally {
    thinking.classList.remove('show');
    btn.classList.remove('loading');
  }
}

// Initialize on load
init();
