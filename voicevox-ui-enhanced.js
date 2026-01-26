// ========================================
// VOICEVOX Enhanced UI JavaScript
// ========================================

// Global variables
let allSpeakersData = null;
let categorizedData = null;
let currentAudio = null;
let currentCategory = 'all';

// Override original load characters function
document.getElementById('loadCharactersBtn').addEventListener('click', async () => {
    const btn = document.getElementById('loadCharactersBtn');
    btn.textContent = '⏳ 불러오는 중...';
    btn.disabled = true;

    try {
        const response = await fetch('http://localhost:4000/api/voicevox/speakers');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || '캐릭터 목록을 불러올 수 없습니다');
        }

        allSpeakersData = data.speakers;
        categorizedData = data.categorized;

        displayCharactersEnhanced(allSpeakersData);
        document.getElementById('charactersGrid').classList.remove('hidden');
        document.getElementById('categoryTabs').classList.remove('hidden');

        // Setup category tabs
        setupCategoryTabs();

    } catch (error) {
        console.error('[VOICEVOX Enhanced] Load error:', error);
        alert('오류: ' + error.message + '\n\nVOICEVOX 또는 AIVISSpeech 앱이 실행 중인지 확인해주세요.');
    } finally {
        if (btn) {
            btn.textContent = '캐릭터 목록 불러오기';
            btn.disabled = false;
        }
    }
});

function setupCategoryTabs() {
    const tabs = document.querySelectorAll('.category-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('active', 'bg-blue-600', 'text-white');
                t.classList.add('bg-slate-700', 'text-slate-300');
            });

            tab.classList.add('active', 'bg-blue-600', 'text-white');
            tab.classList.remove('bg-slate-700', 'text-slate-300');

            const category = tab.dataset.category;
            currentCategory = category;

            if (category === 'all') {
                displayCharactersEnhanced(allSpeakersData);
            } else {
                const filteredSpeakers = categorizedData[category] || [];
                displayCharactersEnhanced(filteredSpeakers);
            }
        });
    });

    const allTab = document.querySelector('.category-tab[data-category="all"]');
    if (allTab) {
        allTab.classList.add('bg-blue-600', 'text-white');
        allTab.classList.remove('bg-slate-700', 'text-slate-300');
    }
}

function displayCharactersEnhanced(speakers) {
    const grid = document.getElementById('charactersGrid');
    grid.className = 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3';
    grid.innerHTML = '';

    speakers.forEach(speaker => {
        speaker.styles.forEach(style => {
            const card = document.createElement('div');
            card.className = 'bg-slate-800 hover:bg-slate-700 rounded-lg p-2 cursor-pointer transition-all border border-slate-700 hover:border-brand-500 relative group flex gap-3 items-center';

            let genderIcon = '🎤';
            if (speaker.gender === 'female') genderIcon = '👧';
            else if (speaker.gender === 'male') genderIcon = '👦';
            else if (speaker.gender === 'robot') genderIcon = '🤖';

            const imageHtml = `
                <div class="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-slate-700 border border-slate-600 relative">
                    <img src="${speaker.imageUrl}" alt="${speaker.nameKr}" 
                        class="w-full h-full object-cover"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                    <div class="absolute inset-0 hidden items-center justify-center text-xl bg-slate-800">
                        ${genderIcon}
                    </div>
                </div>
            `;

            card.innerHTML = `
                ${imageHtml}
                <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-1.5 mb-0.5">
                        <h4 class="text-white font-bold text-sm truncate">${speaker.nameKr}</h4>
                        <span class="text-slate-500 text-[10px] truncate">${speaker.nameJp}</span>
                    </div>
                    <div class="flex items-center gap-1.5 mb-1">
                        <span class="text-brand-400 text-xs font-bold">${style.nameKr}</span>
                        <span class="text-slate-600 text-[9px]">${style.nameJp}</span>
                    </div>
                    ${speaker.useCase ? `<p class="text-slate-500 text-[9px] truncate">${speaker.useCase}</p>` : ''}
                </div>
                <div class="absolute top-2 right-2 flex flex-col items-end gap-1">
                    <div class="px-1.5 py-0.5 bg-slate-900/80 rounded text-[8px] text-slate-400 border border-slate-700 uppercase">${speaker.engineName || 'VOICEVOX'}</div>
                    <div class="w-2 h-2 bg-brand-500 rounded-full animate-pulse opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
            `;

            card.onclick = () => selectAndPreviewCharacter(
                style.id,
                speaker.nameKr,
                speaker.nameJp,
                style.nameKr,
                style.nameJp,
                speaker.useCase,
                speaker.imageUrl,
                speaker.engineUrl
            );

            grid.appendChild(card);
        });
    });
}

function selectAndPreviewCharacter(speakerId, nameKr, nameJp, styleKr, styleJp, useCase, imageUrl, engineUrl) {
    window.selectedSpeakerId = speakerId;
    window.selectedEngineUrl = engineUrl;
    window.selectedCharacterName = `${nameKr} (${styleKr})`;

    document.getElementById('selectedCharacterName').textContent = `${nameKr} (${nameJp})`;

    const styleEl = document.getElementById('selectedCharacterStyle');
    if (styleEl) styleEl.textContent = `${styleKr} (${styleJp})`;

    const useCaseEl = document.getElementById('selectedCharacterUseCase');
    if (useCaseEl) useCaseEl.textContent = useCase || '';

    const engineBadge = document.getElementById('selectedCharacterEngine');
    if (engineBadge) {
        engineBadge.textContent = engineUrl && engineUrl.includes('10101') ? 'AIVISSpeech (High Qual)' : 'VOICEVOX';
        engineBadge.className = 'text-[10px] px-2 py-0.5 rounded bg-brand-900/30 text-brand-400 border border-brand-800/50 mt-1 inline-block';
        engineBadge.classList.remove('hidden');
    }

    document.getElementById('selectedCharacterInfo').classList.remove('hidden');

    playPreview(speakerId, 'こんにちは、よろしくお願いします。', engineUrl);

    if (typeof checkTTSButtonState === 'function') {
        checkTTSButtonState();
    }
}

async function playPreview(speakerId, sampleText = 'こんにちは、よろしくお願いします。', engineUrl = null) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    const stopBtn = document.getElementById('stopPreviewBtn');
    if (stopBtn) stopBtn.classList.remove('hidden');

    try {
        const response = await fetch('http://localhost:4000/api/voicevox/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                speakerId: speakerId,
                sampleText: sampleText,
                engineUrl: engineUrl
            })
        });

        if (!response.ok) throw new Error('샘플 음성 생성 실패');

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudio = new Audio(audioUrl);

        currentAudio.onended = () => {
            if (stopBtn) stopBtn.classList.add('hidden');
        };

        currentAudio.play();

    } catch (error) {
        console.error('Preview error:', error);
        if (stopBtn) stopBtn.classList.add('hidden');
    }
}

document.getElementById('stopPreviewBtn').addEventListener('click', () => {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
        document.getElementById('stopPreviewBtn').classList.add('hidden');
    }
});

console.log('[VOICEVOX Enhanced UI] Script loaded');
