
// --- Global Audio AI Lab Functions (Fix for ReferenceError) ---
// This file is loaded externally to avoid inline script parsing issues.

async function generateQwenAudio(event) {
    // Stop form submission if any
    if (event) event.preventDefault();

    console.log('[Audio AI Lab] generateQwenAudio called');

    const qwenText = document.getElementById('qwenText').value;
    const qwenCommand = document.getElementById('qwenCommand').value; // Prompt/Style

    if (!qwenText) {
        alert('텍스트를 입력해주세요.');
        return;
    }

    const button = event ? event.currentTarget : null;
    let originalText = '';
    if (button) {
        originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<div class="loader w-5 h-5 border-2 border-white border-t-transparent animate-spin"></div> 처리 중...';
    }

    try {
        const prompt = qwenCommand ? qwenCommand : "Natural speech";

        const response = await fetch('/api/audio/qwen-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: qwenText,
                language: 'ko',
                prompt: prompt
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Audio generation failed');
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);

        addAudioSample('Qwen3-TTS', qwenText, audioUrl);

    } catch (error) {
        console.error('TTS Error:', error);
        alert('오류가 발생했습니다: ' + error.message);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }
}

function addAudioSample(modelName, text, audioUrl) {
    const list = document.getElementById('qwenSampleList');
    if (!list) return;

    // Remove empty state if present
    if (list.querySelector('.text-center')) {
        list.innerHTML = '';
    }

    const div = document.createElement('div');
    div.className = 'bg-slate-800/50 rounded-xl p-4 border border-slate-700 hover:border-brand-500 transition-colors group animate-fade-in-up';
    div.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold text-brand-400 bg-brand-400/10 px-2 py-1 rounded">${modelName}</span>
            <span class="text-xs text-slate-500">${new Date().toLocaleTimeString()}</span>
        </div>
        <p class="text-sm text-slate-300 mb-4 line-clamp-2" title="${text}">${text}</p>
        <audio controls class="w-full h-8">
            <source src="${audioUrl}" type="audio/mpeg">
            Your browser does not support the audio element.
        </audio>
    `;

    list.insertBefore(div, list.firstChild);
}

// Explicitly attach to window
window.generateQwenAudio = generateQwenAudio;
window.addAudioSample = addAudioSample;
console.log('[qwen_audio.js] Loaded and functions attached to window.');
