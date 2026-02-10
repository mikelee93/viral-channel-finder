import os, sys
from google import genai

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

prompt = sys.stdin.read()

resp = client.models.generate_content(
    model="gemini-2.0-flash",
    contents=prompt,
)

print(resp.text)
