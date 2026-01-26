// ========================================
// HOT Channel Finder - Advanced Filter Functions
// ========================================

console.log('[hot_channel_functions.js] Script loading...');

// Filter state
let advancedFilterState = {
    contentType: 'shorts',
    growthMetric: 'total_views',
    subscriberMin: 0,
    subscriberMax: 10000000,
    videoCountMin: 0,
    videoCountMax: 1000,
    country: 'KR',
    growthPeriod: 'none'
};

// Open Advanced Filter Modal
function openAdvancedFilterModal() {
    console.log('[hot_channel_functions.js] openAdvancedFilterModal called');
    const modal = document.getElementById('advancedFilterModal');
    if (!modal) {
        console.error('Modal #advancedFilterModal not found');
        return;
    }

    modal.classList.remove('hidden');

    // Restore current state
    selectContentType(advancedFilterState.contentType, false);
    selectGrowthMetric(advancedFilterState.growthMetric, false);
    selectGrowthPeriod(advancedFilterState.growthPeriod, false);
    selectFilterCountry(advancedFilterState.country, false);

    const subMin = document.getElementById('filterSubMin');
    const subMax = document.getElementById('filterSubMax');
    const vidMin = document.getElementById('filterVideoMin');
    const vidMax = document.getElementById('filterVideoMax');

    if (subMin) subMin.value = advancedFilterState.subscriberMin || '';
    if (subMax) subMax.value = advancedFilterState.subscriberMax || '';
    if (vidMin) vidMin.value = advancedFilterState.videoCountMin || '';
    if (vidMax) vidMax.value = advancedFilterState.videoCountMax || '';
}

// Close Advanced Filter Modal
function closeAdvancedFilterModal() {
    const modal = document.getElementById('advancedFilterModal');
    if (modal) modal.classList.add('hidden');
}

// Select Content Type
function selectContentType(type, updateState = true) {
    if (updateState) {
        advancedFilterState.contentType = type;
    }

    // Remove active class from all buttons
    document.querySelectorAll('.content-type-btn').forEach(btn => {
        btn.classList.remove('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg', 'font-bold');
        btn.classList.add('bg-slate-700', 'text-slate-300', 'border-transparent', 'font-medium');
    });

    // Add active class to selected button
    const selectedBtn = document.getElementById(`content-${type}`);
    if (selectedBtn) {
        selectedBtn.classList.remove('bg-slate-700', 'text-slate-300', 'border-transparent', 'font-medium');
        selectedBtn.classList.add('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg', 'font-bold');
    }
}

// Select Growth Period
function selectGrowthPeriod(period, updateState = true) {
    if (updateState) {
        advancedFilterState.growthPeriod = period;
    }

    // Remove active class from all buttons
    document.querySelectorAll('.growth-period-btn').forEach(btn => {
        btn.classList.remove('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg', 'font-bold');
        btn.classList.add('bg-slate-700', 'text-slate-300', 'border-transparent', 'font-medium');
    });

    // Add active class to selected button
    const selectedBtn = document.getElementById(`period-${period}`);
    if (selectedBtn) {
        selectedBtn.classList.remove('bg-slate-700', 'text-slate-300', 'border-transparent', 'font-medium');
        selectedBtn.classList.add('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg', 'font-bold');
    }
}

// Select Growth Metric
function selectGrowthMetric(metric, updateState = true) {
    if (updateState) {
        advancedFilterState.growthMetric = metric;
    }

    // Remove active class from all buttons
    document.querySelectorAll('.growth-metric-btn').forEach(btn => {
        btn.classList.remove('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg', 'font-bold');
        btn.classList.add('bg-slate-700', 'text-slate-300', 'border-transparent', 'font-medium');
    });

    // Add active class to selected button
    const selectedBtn = document.getElementById(`growth-${metric}`);
    if (selectedBtn) {
        selectedBtn.classList.remove('bg-slate-700', 'text-slate-300', 'border-transparent', 'font-medium');
        selectedBtn.classList.add('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg', 'font-bold');
    }
}

// Select Filter Country
function selectFilterCountry(country, updateState = true) {
    if (updateState) {
        advancedFilterState.country = country;
    }

    // Remove active class from all buttons
    document.querySelectorAll('.filter-country-btn').forEach(btn => {
        btn.classList.remove('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg', 'font-bold');
        btn.classList.add('bg-slate-700', 'text-slate-300', 'border-transparent', 'font-medium');
    });

    // Add active class to selected button
    const selectedBtn = document.getElementById(`filter-country-${country}`);
    if (selectedBtn) {
        selectedBtn.classList.remove('bg-slate-700', 'text-slate-300', 'border-transparent', 'font-medium');
        selectedBtn.classList.add('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg', 'font-bold');
    }
}

// Reset Advanced Filters
function resetAdvancedFilters() {
    advancedFilterState = {
        contentType: 'shorts',
        growthMetric: 'total_views',
        subscriberMin: 0,
        subscriberMax: 10000000,
        videoCountMin: 0,
        videoCountMax: 1000,
        country: 'KR',
        growthPeriod: 'none'
    };

    selectContentType('shorts', false);
    selectGrowthMetric('total_views', false);
    selectGrowthPeriod('none', false);
    selectFilterCountry('KR', false);

    const subMin = document.getElementById('filterSubMin');
    const subMax = document.getElementById('filterSubMax');
    const vidMin = document.getElementById('filterVideoMin');
    const vidMax = document.getElementById('filterVideoMax');

    if (subMin) subMin.value = '';
    if (subMax) subMax.value = '';
    if (vidMin) vidMin.value = '';
    if (vidMax) vidMax.value = '';
}

// Apply Advanced Filters
function applyAdvancedFilters() {
    // Update state from inputs
    const subMin = document.getElementById('filterSubMin');
    const subMax = document.getElementById('filterSubMax');
    const vidMin = document.getElementById('filterVideoMin');
    const vidMax = document.getElementById('filterVideoMax');

    advancedFilterState.subscriberMin = subMin ? (parseInt(subMin.value) || 0) : 0;
    advancedFilterState.subscriberMax = subMax ? (parseInt(subMax.value) || 10000000) : 10000000;
    advancedFilterState.videoCountMin = vidMin ? (parseInt(vidMin.value) || 0) : 0;
    advancedFilterState.videoCountMax = vidMax ? (parseInt(vidMax.value) || 1000) : 1000;

    // Close modal
    closeAdvancedFilterModal();

    // Execute search
    searchHotChannels();
}

// Helper to get category icon
function getCategoryIcon(category) {
    const icons = {
        '영화/애니메이션': '🎬', '자동차': '🚗', '음악': '🎵', '반려동물/동물': '🐾', '스포츠': '⚽',
        '여행/이벤트': '✈️', '게임': '🎮', '인물/블로그': '👤', '코미디': '😂', '엔터테인먼트': '🎭',
        '뉴스/정치': '📰', '노하우/스타일': '💄', '교육': '📚', '과학기술': '🔬', '비영리/사회운동': '🤝'
    };
    return icons[category] || '📁';
}

// Open Category Filter Modal
async function openCategoryFilterModal() {
    console.log('[hot_channel_functions.js] openCategoryFilterModal called');
    const modal = document.getElementById('categoryFilterModal');
    if (!modal) {
        console.error('[Category Filter] Modal not found');
        return;
    }

    modal.classList.remove('hidden');

    // 15 Fixed Categories
    const ALL_CATEGORIES = [
        '영화/애니메이션', '자동차', '음악', '반려동물/동물', '스포츠',
        '여행/이벤트', '게임', '인물/블로그', '코미디', '엔터테인먼트',
        '뉴스/정치', '노하우/스타일', '교육', '과학기술', '비영리/사회운동'
    ];

    // Determine source of data: Current Results or DB Stats
    let stats = {};
    let totalCount = 0;

    // Check if we have current active results (Global variable from index.html/main script)
    if (typeof currentChannels !== 'undefined' && currentChannels && currentChannels.length > 0) {
        // Calculate stats from current results
        totalCount = currentChannels.length;
        currentChannels.forEach(ch => {
            const cat = ch.category || '일반';
            stats[cat] = (stats[cat] || 0) + 1;
        });
    } else {
        // Fallback to DB stats
        try {
            const response = await fetch('http://localhost:4000/api/hot-channels/categories');
            const data = await response.json();

            if (data.success && data.categories) {
                data.categories.forEach(c => {
                    stats[c.name] = c.count;
                    totalCount += c.count;
                });

                // Update global total display if using DB stats
                const totalEl = document.getElementById('discovered-channels-total');
                if (totalEl) totalEl.innerText = totalCount.toLocaleString();
            }
        } catch (error) {
            console.error('[Category Filter] Error loading stats:', error);
        }
    }

    const container = document.getElementById('categoryFilterGrid');
    if (container) {
        container.innerHTML = ''; // Clear existing

        // Render ALL 15 Categories (Always)
        ALL_CATEGORIES.forEach(catName => {
            const count = stats[catName] || 0;

            const btn = document.createElement('button');
            const isSelected = advancedFilterState.categories && advancedFilterState.categories.includes(catName);

            btn.className = `p-4 rounded-xl border text-left transition-all ${isSelected
                ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`;

            btn.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${getCategoryIcon(catName)}</span>
                    <div>
                        <h4 class="font-bold text-sm text-white">${catName}</h4>
                        <p class="text-xs text-slate-400 mt-1">${count.toLocaleString()}개 채널</p>
                    </div>
                </div>
            `;

            btn.onclick = () => toggleCategoryFilter(catName, btn);
            container.appendChild(btn);
        });

        // Update header count
        const headerCount = document.querySelector('#categoryFilterModal h3');
        if (headerCount) headerCount.innerHTML = `📂 카테고리 필터 (${totalCount.toLocaleString()})`;
    }
}

// Close Category Filter Modal
function closeCategoryFilterModal() {
    const modal = document.getElementById('categoryFilterModal');
    if (modal) modal.classList.add('hidden');
}

// Toggle Category Selection
function toggleCategoryFilter(categoryName, btnElement) {
    if (!advancedFilterState.categories) advancedFilterState.categories = [];

    const index = advancedFilterState.categories.indexOf(categoryName);
    if (index === -1) {
        // Select
        advancedFilterState.categories.push(categoryName);
        btnElement.className = 'p-4 rounded-xl border text-left transition-all bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20';
    } else {
        // Deselect
        advancedFilterState.categories.splice(index, 1);
        btnElement.className = 'p-4 rounded-xl border text-left transition-all bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200';
    }
}

// Select Category
async function selectCategory(category) {
    const selectedSection = document.getElementById('selectedCategorySection');
    const selectedTitle = document.getElementById('selectedCategoryTitle');
    const selectedChannels = document.getElementById('selectedCategoryChannels');

    if (!selectedSection || !selectedTitle || !selectedChannels) return;

    // Load discovered channels again
    try {
        const response = await fetch('/discovered_channels.json');
        const discoveredChannels = await response.json();

        // Filter by category
        const channelsInCategory = Object.values(discoveredChannels).filter(
            channel => (channel.category || '일반') === category
        );

        // Update UI
        selectedTitle.textContent = `${category} (${channelsInCategory.length}개)`;
        selectedSection.classList.remove('hidden');

        selectedChannels.innerHTML = channelsInCategory.map(channel => `
            <div class="flex items-center gap-4 bg-slate-800/50 rounded-xl p-4 hover:bg-slate-800 transition-all">
                <div class="flex-1">
                    <h5 class="text-white font-bold mb-1">${escapeHtml(channel.name)}</h5>
                    <div class="flex items-center gap-3 text-sm">
                        <span class="text-slate-400">${escapeHtml(channel.channelId)}</span>
                        <span class="px-2 py-0.5 bg-slate-700/80 text-slate-300 rounded text-xs">
                            ${new Date(channel.discoveredAt).toLocaleDateString('ko-KR')}
                        </span>
                    </div>
                </div>
                <a href="https://www.youtube.com/channel/${channel.channelId}" target="_blank"
                    class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all text-sm">
                    채널 보기
                </a>
            </div>
        `).join('');

    } catch (error) {
        console.error('[Category Filter] Error loading category channels:', error);
    }
}


// ========================================
// HOT Channel Search
// ========================================

async function searchHotChannels() {
    const resultsGrid = document.getElementById('channelResultsGrid');
    if (!resultsGrid) return;

    // Show loading state
    resultsGrid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-20">
            <div class="loader w-16 h-16 border-4 border-t-red-500 mb-4"></div>
            <p class="text-slate-300 animate-pulse font-bold text-xl">🔥 HOT 채널 발굴 중...</p>
            <p class="text-slate-500 text-sm mt-2">구독자 대비 조회수를 분석하고 있습니다.</p>
        </div>
    `;

    try {
        console.log('[searchHotChannels] Payload:', advancedFilterState);
        const response = await fetch('http://localhost:4000/api/hot-channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(advancedFilterState)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '채널 검색 실패');
        }

        // Update total count
        const totalCountEl = document.getElementById('discovered-channels-total');
        if (totalCountEl) {
            totalCountEl.textContent = (data.totalCount || 0).toLocaleString();
        }

        // Render channel cards
        renderHotChannelCards(data.channels || []);

    } catch (error) {
        console.error('[HOT Channel Search Error]', error);
        resultsGrid.innerHTML = `
            <div class="col-span-full text-center py-20 bg-slate-800/50 rounded-2xl border border-dashed border-slate-700">
                <div class="bg-red-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span class="text-4xl text-red-500">⚠️</span>
                </div>
                <p class="text-red-400 font-bold text-xl mb-2">채널 검색 실패</p>
                <p class="text-slate-500">${error.message}</p>
                <button onclick="searchHotChannels()" class="mt-6 px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all">
                    다시 시도하기
                </button>
            </div>
        `;
    }
}

// Render HOT Channel Cards
function renderHotChannelCards(channels) {
    const resultsGrid = document.getElementById('channelResultsGrid');
    if (!resultsGrid) return;

    if (!channels || channels.length === 0) {
        resultsGrid.innerHTML = `
            <div class="col-span-full text-center py-20 bg-slate-800/50 rounded-2xl border border-dashed border-slate-700">
                <div class="bg-slate-700/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span class="text-4xl">🔍</span>
                </div>
                <p class="text-slate-300 font-bold text-xl mb-2">검색 결과가 없습니다</p>
                <p class="text-slate-500">필터 조건을 변경해보세요.</p>
            </div>
        `;
        return;
    }

    // Change grid to single column for wider horizontal cards
    resultsGrid.className = 'space-y-4';

    resultsGrid.innerHTML = channels.map(channel => `
        <div class="channel-card bg-slate-800/40 border border-slate-700/50 hover:border-red-500/50 rounded-2xl p-5 transition-all group">
            <div class="flex items-center gap-6">
                <!-- Left: Profile + Tags -->
                <div class="flex-shrink-0 w-48">
                    <div class="flex items-center gap-3 mb-3">
                        <img src="${channel.thumbnail}" alt="${escapeHtml(channel.name)}" 
                            class="w-12 h-12 rounded-full border-2 border-slate-700 group-hover:border-red-500 transition-all">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-bold text-white truncate mb-0.5">${escapeHtml(channel.name)}</h3>
                            <div class="text-xs text-slate-400">${formatCompactNumber(channel.subscribers)} 구독자</div>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        <span class="px-2 py-1 bg-slate-700/80 text-slate-300 rounded text-xs font-medium">${escapeHtml(channel.category || '일반')}</span>
                    </div>
                </div>

                <!-- Center: 5 Video Thumbnails -->
                <div class="flex-1 flex gap-2">
                    ${(channel.recentVideos || []).slice(0, 5).map(video => `
                        <div class="flex-1">
                            <div class="relative h-56 bg-slate-900 rounded-lg overflow-hidden group/thumb">
                                <img src="${video.thumbnail || video.snippet?.thumbnails?.medium?.url || ''}" alt="${escapeHtml(video.title)}" 
                                    class="w-full h-full object-cover">
                                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                                    <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    ${(channel.recentVideos || []).length < 5 ? Array(5 - (channel.recentVideos || []).length).fill(0).map(() => `
                        <div class="flex-1">
                            <div class="h-56 bg-slate-900/50 rounded-lg flex items-center justify-center">
                                <span class="text-slate-600 text-2xl">📹</span>
                            </div>
                        </div>
                    `).join('') : ''}
                </div>

                <!-- Right: Stats -->
                <div class="flex-shrink-0 w-40 text-center space-y-3">
                    <div>
                        <div class="text-xs text-slate-400 mb-1">총 조회수</div>
                        <div class="text-lg font-bold text-white">${formatCompactNumber(channel.totalViews)}</div>
                    </div>
                    <div>
                        <div class="text-xs text-slate-400 mb-1">일일 증감</div>
                        <div class="text-base font-bold text-red-400">+${formatCompactNumber(channel.dailyGrowth)}↗</div>
                    </div>
                    <div>
                        <div class="text-xs text-slate-400 mb-1">추정 수익</div>
                        <div class="text-base font-bold text-green-400">${formatCompactNumber(channel.estimatedRevenue)}원</div>
                    </div>
                </div>
            </div>

            <!-- Action Button -->
            <button onclick="openChannelDetailModal('${channel.channelId}')" 
                class="mt-4 w-full bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold py-2.5 rounded-lg transition-all">
                채널 상세 보기
            </button>
        </div>
    `).join('');
}

// Open Channel Detail Modal (placeholder for Phase 4)
function openChannelDetailModal(channelId) {
    alert(`채널 상세 모달: ${channelId}\n\n이 기능은 Phase 4에서 구현됩니다.`);
}

// ========================================
// Multilingual Keyword Finder Functions
// ========================================

const MULTILANG_CATEGORIES = {
    '영화/애니메이션': '🎬',
    '자동차': '🚗',
    '음악': '🎵',
    '반려동물/동물': '🐾',
    '스포츠': '⚽',
    '여행/이벤트': '✈️',
    '게임': '🎮',
    '인물/블로그': '👤',
    '코미디': '😂',
    '엔터테인먼트': '🎭',
    '뉴스/정치': '📰',
    '노하우/스타일': '💄',
    '교육': '📚',
    '과학기술': '🔬',
    '비영리/사회운동': '🤝'
};

let selectedMultilangCategory = '';
let currentMultilangKeywords = [];

// Initialize multilang category buttons
function initMultilangCategories() {
    console.log('[Multilang] initMultilangCategories called');
    const grid = document.getElementById('multilangCategoryGrid');

    if (!grid) {
        console.warn('[Multilang] Grid element not found!');
        return;
    }

    grid.innerHTML = Object.entries(MULTILANG_CATEGORIES).map(([category, emoji]) => `
        <button onclick="selectMultilangCategory('${category}')" 
            id="multilang-cat-${category.replace(/\//g, '-')}"
            class="multilang-category-btn flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 border-2 border-slate-600 rounded-xl text-slate-300 font-medium transition-all">
            <span class="text-2xl">${emoji}</span>
            <span>${category}</span>
        </button>
    `).join('');
}

// Select multilang category
function selectMultilangCategory(category) {
    selectedMultilangCategory = category;

    document.querySelectorAll('.multilang-category-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'border-blue-500', 'text-white', 'shadow-lg');
        btn.classList.add('bg-slate-700', 'border-slate-600', 'text-slate-300');
    });

    const btn = document.getElementById(`multilang-cat-${category.replace(/\//g, '-')}`);
    if (btn) {
        btn.classList.remove('bg-slate-700', 'border-slate-600', 'text-slate-300');
        btn.classList.add('bg-blue-600', 'border-blue-500', 'text-white', 'shadow-lg');
    }
}

// Search multilang keywords
async function searchMultilangKeywords() {
    if (!selectedMultilangCategory) {
        alert('카테고리를 먼저 선택해주세요!');
        return;
    }

    const loadingSection = document.getElementById('multilangLoadingSection');
    const keywordSection = document.getElementById('multilangKeywordSection');
    const viralVideosSection = document.getElementById('multilangViralVideosSection');

    if (loadingSection) loadingSection.classList.remove('hidden');
    if (keywordSection) keywordSection.classList.add('hidden');
    if (viralVideosSection) viralVideosSection.classList.add('hidden');

    try {
        const response = await fetch('http://localhost:4000/api/multilang-keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: selectedMultilangCategory,
                languages: ['ko', 'en', 'ja'],
                limit: 50
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '키워드 검색 실패');
        }

        currentMultilangKeywords = data.keywords || [];

        const categoryTitle = document.getElementById('multilangCategoryTitle');
        if (categoryTitle) categoryTitle.textContent = `(${selectedMultilangCategory})`;

        const cachedBadge = document.getElementById('multilangCachedBadge');
        if (cachedBadge) cachedBadge.classList.toggle('hidden', !data.cached);

        renderMultilangKeywordTable(currentMultilangKeywords);

        if (loadingSection) loadingSection.classList.add('hidden');
        if (keywordSection) keywordSection.classList.remove('hidden');

    } catch (error) {
        console.error('[Keyword Search Error]', error);
        alert(`에러: ${error.message}`);
        if (loadingSection) loadingSection.classList.add('hidden');
    }
}

// Render keyword table
function renderMultilangKeywordTable(keywords) {
    const tbody = document.getElementById('multilangKeywordTableBody');
    if (!tbody) return;

    tbody.innerHTML = keywords.map(kw => `
        <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition">
            <td class="py-4 text-slate-500 font-bold">${kw.rank}</td>
            <td class="py-4 font-medium">
                <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(kw.ko)}" target="_blank" class="text-blue-400 hover:text-blue-300 hover:underline">
                    ${escapeHtml(kw.ko)}
                </a>
            </td>
            <td class="py-4 text-slate-300">
                <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(kw.en)}" target="_blank" class="text-slate-300 hover:text-white hover:underline">
                    ${escapeHtml(kw.en)}
                </a>
            </td>
            <td class="py-4 text-slate-300">
                <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(kw.ja)}" target="_blank" class="text-slate-300 hover:text-white hover:underline">
                    ${escapeHtml(kw.ja)}
                </a>
            </td>
            <td class="py-4 text-center">
                <span class="px-3 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-sm font-bold">
                    ${formatCompactNumber(kw.totalViews)}
                </span>
            </td>
        </tr>
    `).join('');
}

// Search viral videos by keyword
function searchMultilangViralVideos(keyword) {
    const viralVideosSection = document.getElementById('multilangViralVideosSection');
    const viralVideosGrid = document.getElementById('multilangViralVideosGrid');
    const selectedKeywordSpan = document.getElementById('multilangSelectedKeyword');

    if (selectedKeywordSpan) selectedKeywordSpan.textContent = `"${keyword}"`;
    if (viralVideosSection) viralVideosSection.classList.remove('hidden');

    if (viralVideosGrid) {
        viralVideosGrid.innerHTML = `
            <div class="col-span-full text-center py-12 bg-slate-800/50 rounded-xl">
                <p class="text-slate-400 mb-4 text-lg">💡 이 키워드로 YouTube에서 바이럴 영상을 검색합니다</p>
                <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIYAQ%253D%253D" 
                    target="_blank"
                    class="inline-block mt-4 px-8 py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold rounded-xl transition-all shadow-xl hover:scale-105">
                    🔴 YouTube에서 "${keyword}" Shorts 검색하기
                </a>
            </div>
        `;
    }
}


// ========================================
// Channel Sub-Tab Switching Function
// ========================================
function switchChannelSubTab(subTab) {
    console.log('Switching to sub-tab:', subTab);

    // Get all content sections
    const hotChannels = document.getElementById('channel-finder-main-content');
    const trendingVideos = document.getElementById('trending-videos-main-content');
    const multilangKeywords = document.getElementById('multilang-keywords-content');

    // Get all tab buttons
    const hotTabBtn = document.querySelector('[onclick="switchChannelSubTab(\'hot-channels\')"]');
    const trendingTabBtn = document.querySelector('[onclick="switchChannelSubTab(\'trending-videos\')"]');
    const multilangTabBtn = document.querySelector('[onclick="switchChannelSubTab(\'multilang-keywords\')"]');

    // Hide all content sections
    if (hotChannels) hotChannels.classList.add('hidden');
    if (trendingVideos) trendingVideos.classList.add('hidden');
    if (multilangKeywords) multilangKeywords.classList.add('hidden');

    // Remove active styles from all tabs
    [hotTabBtn, trendingTabBtn, multilangTabBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('border-brand-500', 'text-brand-400');
            btn.classList.add('border-transparent', 'text-slate-400');
        }
    });

    // Show selected content and activate tab
    if (subTab === 'hot-channels') {
        if (hotChannels) hotChannels.classList.remove('hidden');
        if (hotTabBtn) {
            hotTabBtn.classList.add('border-brand-500', 'text-brand-400');
            hotTabBtn.classList.remove('border-transparent', 'text-slate-400');
        }
    } else if (subTab === 'trending-videos') {
        if (trendingVideos) trendingVideos.classList.remove('hidden');
        if (trendingTabBtn) {
            trendingTabBtn.classList.add('border-brand-500', 'text-brand-400');
            trendingTabBtn.classList.remove('border-transparent', 'text-slate-400');
        }

        // Initial load if empty
        const tableBody = document.getElementById('trendingVideosTableBody');
        if (tableBody && (tableBody.children.length === 0 || tableBody.innerText.includes('클릭하여'))) {
            if (typeof loadTrendingVideos === 'function') {
                loadTrendingVideos('all', 'KR');
            }
        }
    } else if (subTab === 'multilang-keywords') {
        if (multilangKeywords) multilangKeywords.classList.remove('hidden');
        if (multilangTabBtn) {
            multilangTabBtn.classList.add('border-brand-500', 'text-brand-400');
            multilangTabBtn.classList.remove('border-transparent', 'text-slate-400');
        }

        // Initialize categories if needed
        initMultilangCategories();
    }
}

// Explicitly assign to window to avoid scope issues
window.openAdvancedFilterModal = openAdvancedFilterModal;
window.openCategoryFilterModal = openCategoryFilterModal;
window.switchChannelSubTab = switchChannelSubTab;
window.searchHotChannels = searchHotChannels;
window.renderHotChannelCards = renderHotChannelCards;
window.initMultilangCategories = initMultilangCategories;
window.selectMultilangCategory = selectMultilangCategory;
window.searchMultilangKeywords = searchMultilangKeywords;
window.searchMultilangViralVideos = searchMultilangViralVideos;

console.log('[hot_channel_functions.js] Functions attached to window');
