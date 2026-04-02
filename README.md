# 🎨 Sketch AI: Your Personalized Drawing Companion

A minimalist, premium web application designed to break your creative blocks using state-of-the-art AI. Sketch AI provides dynamic drawing prompts, adaptive challenges, and atmospheric guidance using Google Gemini and Groq (Llama 3.1).

---

## ✨ Key Features

- **⚡ Dual AI Engines**: Choose between **Google Gemini 1.5** and **Groq (Fast Mode)** for lightning-fast generation.
- **🌱 Dynamic Idea Generation**: Never stare at a blank page again. Generate unique prompts based on your mood or favorite themes.
- **🏆 Adaptive Challenges**: The AI learns from your drawing history to suggest personalized challenges that push your skills further.
- **🕊️ Atmospheric AI Assistant**: Use the "Ask AI" tab to get poetic, guided drawing prompts for specific moods.
- **💾 Local First**: Your API keys, sketches, and progress are stored securely in your browser's local storage.
- **🖌️ Minimalist Drawing Tool**: A distraction-free canvas designed for quick sketches and observational practice.

---

## 🚀 Getting Started

### 1. Requirements
- A modern web browser (Chrome, Firefox, Edge, etc.).
- A local environment (Python is recommended for serving the files).

### 2. Local Setup
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/DRAKZO010/sketch.git
   cd sketch
   ```
2. **Start a Local Server**:
   On Windows (PowerShell):
   ```powershell
   py -m http.server 8042
   ```
3. **Open the App**:
   Navigate to `http://localhost:8042` in your browser.

---

## 🛠️ Configuring the AI

To enable the AI features, you'll need an API key from either Google or Groq.

### Option A: Groq (Recommended - Fast & Free)
1. Go to [Groq Cloud Console](https://console.groq.com/keys).
2. Create a free API key (no credit card required).
3. In the Sketch app, click the **⚙️ Gear Icon** (Settings).
4. Click the **"Groq (Fast)"** pill at the top.
5. Paste your key and click **Save**.

### Option B: Google Gemini
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Create your API key.
3. In the Sketch app, click the **⚙️ Gear Icon** (Settings).
4. Paste your key under the **Gemini** tab and click **Save**.

---

## 🖌️ How to Use

1. **Pick a Theme**: Use the filter icons (Nature, Architecture, Abstract, etc.) to set a mood.
2. **Generate Idea**: Click the "New Idea" button to get a unique drawing prompt and a visual reference (via Pollinations.ai).
3. **Draw**: Use the touch-friendly canvas to sketch your idea. 
4. **Complete Challenges**: Visit the "Challenges" tab to commit to multi-session goals. The AI will add new ones automatically as you finish!
5. **Ask for Guidance**: If you have a specific object in mind, use the "Ask AI" tab to get a poetic breakdown of how to draw it.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, CSS3 (Modern Flexbox/Grid), JavaScript (ES6+).
- **AI Models**: Google Gemini 1.5 Flash, Meta Llama 3.1 (via Groq).
- **Visuals**: Pollinations AI (Text-to-Image pipeline).
- **Icons**: Lucide Icons & Custom SVG.

---

## 📝 License

This project is open-source. Feel free to fork and build your own creative companion!
