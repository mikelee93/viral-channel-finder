from transformers import AutoProcessor, AutoModel
import torch

MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"

print(f"Testing load for: {MODEL_ID}")
try:
    processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True)
    print("Success!")
except Exception as e:
    print(f"FAILED: {e}")
