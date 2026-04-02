import requests
import json
import os

def test_key():
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print("API Key not found in environment variable 'GEMINI_API_KEY'")
        return

    # 1. Try listing models to see what's available
    url_list = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        resp = requests.get(url_list)
        if resp.status_code == 200:
            models = resp.json()
            print("--- Available Models (v1beta) ---")
            for m in models.get('models', []):
                if 'flash' in m['name'].lower() or 'pro' in m['name'].lower():
                    print(f"Name: {m['name']}, Supported Methods: {m['supportedMethods']}")
        else:
            print(f"List Models failed: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"Error listing: {e}")

    # 2. Try a simple generateContent with v1
    url_gen = f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "Hello"}]}]
    }
    try:
        resp = requests.post(url_gen, json=payload)
        print(f"\n--- Test Generate (v1) ---")
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("Success!")
        else:
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Error generating: {e}")

if __name__ == "__main__":
    test_key()
