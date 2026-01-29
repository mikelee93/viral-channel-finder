@echo off
echo Starting Local Qwen-TTS Server...
python local_tts_server.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server crashed or closed unexpectedly!
    echo Please check the error message above.
)
pause
