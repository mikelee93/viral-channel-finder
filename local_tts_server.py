from flask import Flask, request, send_file
from io import BytesIO
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
import sys

app = Flask(__name__)

# Config
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
PORT = 5001

print(f"🎙️  Loading Qwen3-TTS model: {MODEL_ID}...", flush=True)


try:
    # Load model using official qwen-tts package
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID,
        device_map="auto",  # Automatically select GPU if available
        dtype=torch.bfloat16,
        # attn_implementation="flash_attention_2",  # Uncomment if flash-attn is installed
    )
    print("✅ Model loaded successfully!", flush=True)
    print(f"📋 Supported speakers: {model.get_supported_speakers()}", flush=True)
    print(f"🌍 Supported languages: {model.get_supported_languages()}", flush=True)
except Exception as e:
    import traceback
    print(f"❌ Error loading model: {e}", flush=True)
    print("Full traceback:", flush=True)
    traceback.print_exc()
    
    # Write error to file for debugging
    with open("tts_error.log", "w", encoding="utf-8") as f:
        f.write(f"Error loading model: {e}\n\n")
        f.write("Traceback:\n")
        traceback.print_exc(file=f)
    
    model = None



@app.route('/tts', methods=['POST'])
def tts():
    if model is None:
        return {"error": "Model not loaded"}, 500
        
    data = request.json
    text = data.get('text', '')
    language = data.get('language', 'Korean')  # Default to Korean
    speaker = data.get('speaker', 'Vivian')  # Default speaker
    instruct = data.get('prompt', '')  # Optional instruction
    
    if not text:
        return {"error": "No text provided"}, 400

    print(f"[TTS] Generating audio for: {text[:50]}...")
    print(f"[TTS] Language: {language}, Speaker: {speaker}, Instruct: {instruct}")

    # Validate speaker
    supported_speakers = model.get_supported_speakers() if hasattr(model, 'get_supported_speakers') else ['Vivian']
    
    if speaker not in supported_speakers:
        print(f"[TTS] Warning: Speaker '{speaker}' not found in supported list: {supported_speakers[:5]}...", flush=True)
        # Fallback based on some logic or default
        # If we have a male/female mapping we could use it, but for now default to Vivian or first available
        fallback_speaker = supported_speakers[0] if supported_speakers else 'Vivian'
        print(f"[TTS] Falling back to default speaker: {fallback_speaker}", flush=True)
        speaker = fallback_speaker

    try:
        # Generate audio using Qwen3-TTS
        wavs, sr = model.generate_custom_voice(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct if instruct else None
        )

        
        # Save to BytesIO
        audio_fp = BytesIO()
        sf.write(audio_fp, wavs[0], sr, format='WAV')
        audio_fp.seek(0)
        
        return send_file(audio_fp, mimetype="audio/wav", as_attachment=False, download_name="speech.wav")

    except Exception as e:
        print(f"[TTS] Generation error: {e}")
        return {"error": str(e)}, 500

@app.route('/health', methods=['GET'])
def health():
    print(f"[HEALTH] Model object: {model}", flush=True)
    print(f"[HEALTH] Model type: {type(model)}", flush=True)
    print(f"[HEALTH] Model is None: {model is None}", flush=True)
    print(f"[HEALTH] Model is truthy: {bool(model)}", flush=True)
    return {
        "status": "ok" if model else "error",
        "engine": "Qwen3-TTS",
        "model": MODEL_ID
    }


if __name__ == '__main__':
    print(f"🚀 Starting Qwen3-TTS Server on port {PORT}...", flush=True)
    app.run(host='0.0.0.0', port=PORT, debug=False)
