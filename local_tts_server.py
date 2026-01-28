from flask import Flask, request, send_file
from io import BytesIO
from gtts import gTTS
import os

# Initialize Flask app
app = Flask(__name__)

@app.route('/tts', methods=['POST'])
def tts():
    data = request.json
    
    # Support both formats: {text, prompt} and {inputs, parameters}
    text = data.get('text') or data.get('inputs', '')
    
    if isinstance(text, list):
        text = ' '.join(text)
    
    if not text:
        return {"error": "No text provided"}, 400

    print(f"[TTS] Generating audio for: {text[:50]}...")

    try:
        # Detect language (default to Korean)
        lang = 'ko'
        
        # Check if text contains mostly English
        english_chars = sum(1 for c in text if ord(c) < 128)
        if english_chars / len(text) > 0.7:
            lang = 'en'
        
        # Generate audio using Google TTS
        tts_obj = gTTS(text=text, lang=lang, slow=False)
        
        # Save to BytesIO
        audio_fp = BytesIO()
        tts_obj.write_to_fp(audio_fp)
        audio_fp.seek(0)
        
        return send_file(audio_fp, mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")

    except Exception as e:
        print(f"[TTS] Generation error: {e}")
        return {"error": str(e)}, 500

@app.route('/health', methods=['GET'])
def health():
    return {"status": "ok", "engine": "gTTS"}

if __name__ == '__main__':
    print("🎙️  Starting TTS Server on port 5001...")
    print("💡 Using Google TTS (gTTS) for Korean support")
    app.run(host='0.0.0.0', port=5001, debug=False)
