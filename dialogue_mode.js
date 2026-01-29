/**
 * Switches the Audio AI Lab sub-tabs
 */
function switchAudioSubTab(tabName) {
    // Hide all views
    document.querySelectorAll('.audio-view').forEach(view => {
        view.classList.add('hidden');
    });

    // Deactivate all buttons
    document.querySelectorAll('.audio-subtab-btn').forEach(btn => {
        btn.classList.remove('bg-brand-600', 'text-white', 'font-black', 'shadow-lg');
        btn.classList.add('text-slate-400', 'font-bold');
    });

    // Activate target
    document.getElementById(`${tabName}-view`).classList.remove('hidden');
    const activeBtn = document.getElementById(`subtab-${tabName}`);
    activeBtn.classList.remove('text-slate-400');
    activeBtn.classList.add('bg-brand-600', 'text-white', 'font-black', 'shadow-lg');
}

/**
 * Toggles Dialogue Mode (Auto vs Manual)
 */
function toggleDialogueMode(mode) {
    const autoInput = document.getElementById('auto-mode-input');
    const manualInput = document.getElementById('manual-mode-input');
    const btnAuto = document.getElementById('mode-btn-auto');
    const btnManual = document.getElementById('mode-btn-manual');

    if (mode === 'auto') {
        autoInput.classList.remove('hidden');
        manualInput.classList.add('hidden');

        btnAuto.classList.add('bg-slate-600', 'text-white');
        btnAuto.classList.remove('text-slate-400');

        btnManual.classList.remove('bg-slate-600', 'text-white');
        btnManual.classList.add('text-slate-400');
    } else {
        autoInput.classList.add('hidden');
        manualInput.classList.remove('hidden');

        btnManual.classList.add('bg-slate-600', 'text-white');
        btnManual.classList.remove('text-slate-400');

        btnAuto.classList.remove('bg-slate-600', 'text-white');
        btnAuto.classList.add('text-slate-400');
    }

    // Store current mode
    window.dialogueMode = mode;
}

/**
 * Starts the Dialogue Session
 */
async function startDialogue() {
    const stage = document.getElementById('dialogueStage');
    const status = document.getElementById('dialogueStatus');
    const mode = window.dialogueMode || 'auto';

    const personaA = {
        name: document.getElementById('personaAName').value,
        role: document.getElementById('personaARole').value,
        language: document.getElementById('personaALang').value,
        gender: "Male"
    };

    const personaB = {
        name: document.getElementById('personaBName').value,
        role: document.getElementById('personaBRole').value,
        language: document.getElementById('personaBLang').value,
        gender: "Female"
    };

    let dialogueData = [];

    // Clear stage immediately
    stage.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12">
            <div class="loader w-10 h-10 border-4 border-brand-500 border-t-transparent mx-auto mb-4" style="border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p class="text-slate-400 animate-pulse">${mode === 'auto' ? '대본 작성 중... (AI)' : '대본 분석 중... (스크립트 파싱)'}</p>
        </div>
    `;
    status.innerText = '대본 처리 중...';

    try {
        if (mode === 'auto') {
            // --- AUTO MODE ---
            const topic = document.getElementById('dialogueTopic').value;
            if (!topic) return alert('상황 설정을 입력해주세요!');

            const response = await fetch('http://localhost:4000/api/audio/dialogue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, personaA, personaB, turns: 3 })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '대화 생성 실패');
            dialogueData = data.dialogue;

        } else {
            // --- MANUAL MODE ---
            const script = document.getElementById('dialogueScript').value;
            if (!script) return alert('대본을 입력해주세요!');

            const response = await fetch('http://localhost:4000/api/audio/parse-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script, personaA, personaB })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '대본 파싱 실패');
            dialogueData = data.dialogue;
        }

        // Render Text Immediately
        status.innerText = '오디오 생성 중...';
        await renderDialogueWithAsyncAudio(dialogueData, personaA, personaB);
        status.innerText = '준비 완료';

    } catch (error) {
        console.error('Dialogue Error:', error);
        stage.innerHTML = `
            <div class="text-center py-10 text-red-400">
                <p>⚠️ 오류 발생: ${error.message}</p>
            </div>
        `;
        status.innerText = '오류 발생';
    }
}


/**
 * Renders the dialogue sequence and fetches audio one by one
 */
async function renderDialogueWithAsyncAudio(dialogue, personaA, personaB) {
    const stage = document.getElementById('dialogueStage');
    stage.innerHTML = ''; // Clear loading

    for (let i = 0; i < dialogue.length; i++) {
        const turn = dialogue[i];
        const isLeft = turn.speaker === personaA.name;
        const alignClass = isLeft ? 'justify-start' : 'justify-end';
        const bgClass = isLeft ? 'bg-blue-600/20 border-blue-500/50' : 'bg-pink-600/20 border-pink-500/50';
        const icon = isLeft ? '👨‍💼' : '👩‍💼';
        const uniqueId = `audio-${i}`;
        const loaderId = `loader-${i}`;

        // Create Bubble with Loading State for Audio
        const bubble = document.createElement('div');
        bubble.className = `flex ${alignClass} opacity-0 transform translate-y-4 transition-all duration-500`;
        bubble.style.animationDelay = `${i * 0.1}s`;

        bubble.innerHTML = `
            <div class="max-w-[80%] flex ${isLeft ? 'flex-row' : 'flex-row-reverse'} gap-3">
                <div class="text-3xl select-none pt-1" title="${turn.speaker}">${icon}</div>
                <div class="p-4 rounded-2xl border ${bgClass} shadow-lg backdrop-blur-sm min-w-[200px]">
                    <p class="font-bold text-xs text-slate-500 mb-1">${turn.speaker} <span class="opacity-50">(${turn.role})</span></p>
                    <p class="text-white leading-relaxed mb-2">${turn.text}</p>
                    
                    <div id="${loaderId}" class="flex items-center gap-2 text-xs text-slate-400">
                        <div class="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                        음성 합성 중...
                    </div>
                    
                    <audio id="${uniqueId}" class="hidden" controls style="height: 30px; width: 100%; margin-top: 5px;"></audio>
                </div>
            </div>
        `;

        stage.appendChild(bubble);

        // Appear effect
        setTimeout(() => {
            bubble.classList.remove('opacity-0', 'translate-y-4');
        }, i * 100);

        // Scroll to bottom
        stage.scrollTop = stage.scrollHeight;
    }

    // 3. Fetch Audio Sequentially (to avoid overloading local GPU/CPU)
    for (let i = 0; i < dialogue.length; i++) {
        const turn = dialogue[i];
        await generateAndSetAudio(turn, i, personaA, personaB);
    }
}

async function generateAndSetAudio(turn, index, personaA, personaB) {
    const uniqueId = `audio-${index}`;
    const loaderId = `loader-${index}`;
    const audioElement = document.getElementById(uniqueId);
    const loaderElement = document.getElementById(loaderId);

    // Determine language from persona config if not in turn
    // (turn data might just have text)
    const speakerLang = (turn.speaker === personaA.name) ? personaA.language : personaB.language;

    try {
        const response = await fetch('/api/audio/qwen-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: turn.text,
                language: speakerLang,
                prompt: turn.role // Use role as style prompt
            })
        });

        if (!response.ok) throw new Error('Audio generation failed');

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);

        audioElement.src = audioUrl;
        audioElement.classList.remove('hidden');
        loaderElement.classList.add('hidden');

        // Auto-play the first one? Maybe not to annoy user.
        // But we could auto-play sequentially if we wanted.

    } catch (err) {
        console.error(`Audio failed for turn ${index}:`, err);
        loaderElement.innerHTML = `<span class="text-red-400">❌ 음성 오류</span>`;
    }
}


function playAudio(id) {
    const audio = document.getElementById(id);
    if (audio) {
        audio.currentTime = 0;
        audio.play();
    }
}

// Global scope binding
window.switchAudioSubTab = switchAudioSubTab;
window.startDialogue = startDialogue;
window.playAudio = playAudio;
window.toggleDialogueMode = toggleDialogueMode;

