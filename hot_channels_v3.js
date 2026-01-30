// ========================================
// HOT Channel Finder - Advanced Filter Functions
// ========================================

console.log('[hot_channel_functions.js] Script loading...');
window.isV3Loaded = true;

// Filter state
let advancedFilterState = {
    contentType: 'shorts',
    growthMetric: 'total_views',
    subscriberMin: 0,
    subscriberMax: 10000000,
    videoCountMin: 0,
    videoCountMax: 1000,
    country: 'KR',
    growthPeriod: 'none',
    categories: [] // New: Multi-select categories
};

// Render Category Grid in Advanced Filter Modal
function renderAdvancedFilterCategories() {
    const grid = document.getElementById('advanced-filter-category-grid');
    if (!grid) return;

    const CATEGORIES = [
        '영화/애니메이션', '자동차', '음악', '반려동물/동물', '스포츠',
        '여행/이벤트', '게임', '인물/블로그', '코미디', '엔터테인먼트',
        '뉴스/정치', '노하우/스타일', '교육', '과학기술', '비영리/사회운동'
    ];

    grid.innerHTML = CATEGORIES.map(cat => {
        const isSelected = advancedFilterState.categories.includes(cat);
        const icon = getCategoryIcon(cat);
        return `
            <button onclick="toggleAdvancedFilterCategory('${cat}')" 
                class="flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${isSelected
                ? 'bg-brand-600 border-brand-500 text-white shadow-md'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}">
                <span class="text-xl mb-1">${icon}</span>
                <span class="text-[10px] font-medium text-center leading-tight">${cat}</span>
            </button>
        `;
    }).join('');

    // Update count
    const countEl = document.getElementById('selected-category-count');
    if (countEl) countEl.textContent = `${advancedFilterState.categories.length}개 선택됨`;
}

// Toggle Category in Advanced Filter
function toggleAdvancedFilterCategory(category) {
    const index = advancedFilterState.categories.indexOf(category);
    if (index === -1) {
        advancedFilterState.categories.push(category);
    } else {
        advancedFilterState.categories.splice(index, 1);
    }
    renderAdvancedFilterCategories();
}

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
    if (vidMin) vidMin.value = advancedFilterState.videoCountMin || '';
    if (vidMax) vidMax.value = advancedFilterState.videoCountMax || '';

    // Render Categories
    renderAdvancedFilterCategories();
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
        country: 'KR',
        growthPeriod: 'none',
        categories: []
    };

    selectContentType('shorts', false);
    selectGrowthMetric('total_views', false);
    selectGrowthPeriod('none', false);
    selectFilterCountry('KR', false);

    // Reset categories
    renderAdvancedFilterCategories();

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

const CATEGORY_MAPPING = {
    'Film & Animation': '영화/애니메이션',
    'Autos & Vehicles': '자동차',
    'Music': '음악',
    'Pets & Animals': '반려동물/동물',
    'Sports': '스포츠',
    'Travel & Events': '여행/이벤트',
    'Gaming': '게임',
    'People & Blogs': '인물/블로그',
    'Comedy': '코미디',
    'Entertainment': '엔터테인먼트',
    'News & Politics': '뉴스/정치',
    'Howto & Style': '노하우/스타일',
    'Education': '교육',
    'Science & Technology': '과학기술',
    'Nonprofits & Activism': '비영리/사회운동'
};

function normalizeCategory(cat) {
    if (!cat) return '일반';
    return CATEGORY_MAPPING[cat] || cat || '일반';
}

// Helper to get category icon
function getCategoryIcon(category) {
    const icons = {
        '영화/애니메이션': '🎬', '자동차': '🚗', '음악': '🎵', '반려동물/동물': '🐾', '스포츠': '⚽',
        '여행/이벤트': '✈️', '게임': '🎮', '인물/블로그': '👤', '코미디': '😂', '엔터테인먼트': '🎭',
        '뉴스/정치': '📰', '노하우/스타일': '💄', '교육': '📚', '과학기술': '🔬', '비영리/사회운동': '🤝',
        '일반': '🗂️'
    };
    return icons[category] || '📁';
}

// Open Category Filter Modal
let selectedCategoryFilterCountry = 'KR'; // Default

// Open Category Filter Modal
// let selectedCategoryFilterCountry = 'KR'; // Already declared above

async function openCategoryFilterModal() {
    console.log('[hot_channel_functions.js] openCategoryFilterModal called');
    const modal = document.getElementById('categoryFilterModal');
    if (!modal) {
        console.error('[Category Filter] Modal not found');
        return;
    }

    modal.classList.remove('hidden');

    // Initialize with current country from advanced filter or default
    if (advancedFilterState && advancedFilterState.country) {
        selectedCategoryFilterCountry = advancedFilterState.country;
    } else {
        selectedCategoryFilterCountry = 'KR'; // Default
    }

    // Render Country Selector and Search Button dynamically if not present
    const headerSection = modal.querySelector('.p-6.border-b.border-slate-700');
    if (headerSection && !headerSection.querySelector('#categoryFilterCountrySection')) {
        const countrySection = document.createElement('div');
        countrySection.id = 'categoryFilterCountrySection';
        countrySection.className = 'mt-4 flex items-center justify-between';
        countrySection.innerHTML = `
            <div class="flex items-center gap-2">
                <button onclick="selectCategoryFilterCountry('KR')" id="cat-filter-country-KR" class="filter-country-btn px-4 py-2 rounded-lg bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 transition-all text-sm font-bold">🇰🇷 대한민국</button>
                <button onclick="selectCategoryFilterCountry('US')" id="cat-filter-country-US" class="filter-country-btn px-4 py-2 rounded-lg bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 transition-all text-sm font-bold">🇺🇸 미국</button>
                <button onclick="selectCategoryFilterCountry('JP')" id="cat-filter-country-JP" class="filter-country-btn px-4 py-2 rounded-lg bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 transition-all text-sm font-bold">🇯🇵 일본</button>
                <button onclick="selectCategoryFilterCountry('ALL')" id="cat-filter-country-ALL" class="filter-country-btn px-4 py-2 rounded-lg bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 transition-all text-sm font-bold">🌎 전체</button>
            </div>
            <button onclick="searchCategoryFilterDB()" class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg transition-all flex items-center gap-2">
                <span>🔍 채널 불러오기</span>
            </button>
        `;
        headerSection.appendChild(countrySection);
    }

    // Initial load of stats for the selected country
    selectCategoryFilterCountry(selectedCategoryFilterCountry);
}

// Select Country in Category Filter Modal and Refresh Stats
async function selectCategoryFilterCountry(countryCode) {
    selectedCategoryFilterCountry = countryCode;

    // Remove active styles from all buttons
    ['KR', 'US', 'JP', 'ALL'].forEach(code => {
        const btn = document.getElementById(`cat-filter-country-${code}`);
        if (btn) {
            btn.classList.remove('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg');
            btn.classList.add('bg-slate-700', 'text-slate-300', 'border-slate-600');
        }
    });

    // Add active style to selected button
    const selectedBtn = document.getElementById(`cat-filter-country-${countryCode}`);
    if (selectedBtn) {
        selectedBtn.classList.remove('bg-slate-700', 'text-slate-300', 'border-slate-600');
        selectedBtn.classList.add('bg-red-600', 'text-white', 'border-red-500', 'shadow-lg');
    }

    // Fetch stats for this country
    await updateCategoryStats(countryCode);
}

// Helper to update category grid based on stats
async function updateCategoryStats(country) {
    const ALL_CATEGORIES = [
        '영화/애니메이션', '자동차', '음악', '반려동물/동물', '스포츠',
        '여행/이벤트', '게임', '인물/블로그', '코미디', '엔터테인먼트',
        '뉴스/정치', '노하우/스타일', '교육', '과학기술', '비영리/사회운동',
        '일반'
    ];

    let stats = {};
    let totalCount = 0;

    try {
        const response = await fetch(`http://localhost:4000/api/hot-channels/categories?country=${country}`);
        const data = await response.json();

        if (data.success && data.categories) {
            data.categories.forEach(c => {
                const cat = normalizeCategory(c.name);
                const finalCat = ALL_CATEGORIES.includes(cat) ? cat : '일반';
                stats[finalCat] = (stats[finalCat] || 0) + c.count;
                totalCount += c.count;
            });
        }
    } catch (error) {
        console.error('[Category Filter] Error loading stats:', error);
    }

    // Render Grid
    const container = document.getElementById('categoryFilterGrid');
    if (container) {
        container.innerHTML = ''; // Clear existing

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

    // Apply Client-Side Filter
    if (typeof window.currentChannels !== 'undefined' && window.currentChannels) {
        let filtered = window.currentChannels;

        if (advancedFilterState.categories && advancedFilterState.categories.length > 0) {
            // Re-define categories for consistent checking
            const VALID_CATEGORIES = [
                '영화/애니메이션', '자동차', '음악', '반려동물/동물', '스포츠',
                '여행/이벤트', '게임', '인물/블로그', '코미디', '엔터테인먼트',
                '뉴스/정치', '노하우/스타일', '교육', '과학기술', '비영리/사회운동',
                '일반'
            ];

            filtered = window.currentChannels.filter(ch => {
                let cat = normalizeCategory(ch.category);
                if (!VALID_CATEGORIES.includes(cat)) cat = '일반';
                return advancedFilterState.categories.includes(cat);
            });
        }

        renderHotChannelCards(filtered);

        // Update total count display to show filtered count
        const totalEl = document.getElementById('discovered-channels-total');
        if (totalEl) totalEl.textContent = filtered.length.toLocaleString();
    }
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

// Search DB with Category Filter + Country
async function searchCategoryFilterDB() {
    console.log('[Category Filter] DB Search initiated');
    closeCategoryFilterModal();

    // Update Global Filter State
    if (!advancedFilterState) advancedFilterState = {};
    advancedFilterState.country = selectedCategoryFilterCountry;
    // Note: advancedFilterState.categories is updated by toggleCategoryFilter

    // Trigger Search (Local Only)
    // Relax video count limit to verify total count matches stats
    const savedVideoMax = advancedFilterState.videoCountMax;
    const savedSubMax = advancedFilterState.subscriberMax;

    advancedFilterState.videoCountMax = 1000000; // Allow huge number of videos
    advancedFilterState.subscriberMax = 200000000; // Allow up to 200M subs (practically unlimited)
    advancedFilterState.localOnly = true;

    await searchHotChannels();

    // Reset flags
    advancedFilterState.localOnly = false;
    advancedFilterState.videoCountMax = savedVideoMax;
    advancedFilterState.subscriberMax = savedSubMax;
}


// Open Channel Detail Modal (placeholder for Phase 4)
function openChannelDetailModal(channelId) {
    alert(`채널 상세 모달: ${channelId}\n\n이 기능은 Phase 4에서 구현됩니다.`);
}

// Search HOT Channels
async function searchHotChannels() {
    const resultsGrid = document.getElementById('channelResultsGrid');
    if (!resultsGrid) return;

    resultsGrid.innerHTML = `
        <div class="col-span-full text-center py-20 bg-slate-800/50 rounded-2xl border border-dashed border-slate-700">
            <div class="bg-slate-700/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span class="text-4xl animate-bounce">🚀</span>
            </div>
            <p class="text-slate-300 font-bold text-xl mb-2">채널 검색 중...</p>
            <p class="text-slate-500">필터 조건에 맞는 채널을 찾고 있습니다.</p>
        </div>
    `;

    try {
        console.log('[searchHotChannels] Payload:', advancedFilterState);
        const response = await fetch('http://localhost:4000/api/hot-channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(advancedFilterState) // advancedFilterState now contains localOnly if set
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

        // Store for category filter
        window.currentChannels = data.channels || [];

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

// Helper: Format ISO 8601 Duration (e.g., PT1M2S -> 1:02)
function formatDuration(iso) {
    if (!iso) return '';
    const match = iso.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return '';
    const h = parseInt(match[1]) || 0;
    const m = parseInt(match[2]) || 0;
    const s = parseInt(match[3]) || 0;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Helper: Time Ago (e.g., 2일 전)
function timeAgo(dateString) {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일 전`;
    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    return '방금 전';
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
                            onerror="this.onerror=null; this.src='https://placehold.co/100?text=Ch';"
                            class="w-12 h-12 rounded-full border-2 border-slate-700 group-hover:border-red-500 transition-all">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-bold text-white truncate mb-0.5">${escapeHtml(channel.name)}</h3>
                            <div class="text-xs text-slate-400">${formatCompactNumber(channel.subscribers)} 구독자</div>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        <span class="px-2 py-1 bg-slate-700/80 text-slate-300 rounded text-xs font-medium">${escapeHtml(normalizeCategory(channel.category))}</span>
                    </div>
                </div>

                <!-- Center: 5 Video Thumbnails -->
                <div class="flex-1 flex gap-2">
                    ${(channel.recentVideos || []).slice(0, 5).map(video => `
                        <div class="flex-1">
                            <div class="relative h-56 bg-slate-900 rounded-lg overflow-hidden group/thumb">
                                <img src="${video.thumbnail || video.snippet?.thumbnails?.medium?.url || ''}" 
                                    alt="${escapeHtml(video.title)}" 
                                    onerror="this.onerror=null; this.src='https://placehold.co/320x180?text=No+Img';"
                                    class="w-full h-full object-cover">
                                
                                <!-- Duration Badge -->
                                <!-- Duration: Moved to bottom bar -->
                                
                                <!-- Date Badge -->
                                ${video.publishedAt ? `<div class="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 text-slate-200 text-xs rounded shadow-sm backdrop-blur-sm">${timeAgo(video.publishedAt)}</div>` : ''}

                                <!-- Always visible Overlay at the bottom -->
                                <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-end justify-between z-20">
                                    <span class="text-[10px] text-white font-bold bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                                        ${video.duration ? formatDuration(video.duration) : ''}
                                    </span>
                                    <span class="text-[10px] text-white font-bold bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                                        ${video.viewCount ? formatCompactNumber(video.viewCount) : ''}
                                        ${video.viewCount ? '' : ''}
                                    </span>
                                </div>
                                
                                <div class="absolute inset-0 z-10 hidden group-hover/thumb:flex items-center justify-center bg-black/20 pointer-events-none">
                                    <!-- Optional: Play icon on hover -->
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
            <!-- Action Button: Open Channel in New Tab -->
            <button onclick="window.open('https://www.youtube.com/channel/${channel.channelId}', '_blank')" 
                class="mt-4 w-full bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2">
                <span>📺</span> 채널 바로가기
            </button>
        </div>
    `).join('');
}

// Open Channel Detail Modal (placeholder for Phase 4)

// Open Channel Detail Modal with AI Analysis
async function openChannelDetailModal(channelId) {
    // 1. Create Modal if checks fail
    let modal = document.getElementById('channelDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'channelDetailModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div class="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                    <h3 class="text-xl font-bold text-white flex items-center gap-2">
                        <span class="text-2xl">📊</span> 채널 심층 분석
                    </h3>
                    <button onclick="document.getElementById('channelDetailModal').classList.add('hidden')" class="text-slate-400 hover:text-white transition-colors">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div id="channelDetailContent" class="flex-1 overflow-y-auto p-6 space-y-6">
                    <!-- Dynamic Content -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // 2. Show Modal & Loading
    modal.classList.remove('hidden');
    const contentDiv = document.getElementById('channelDetailContent');
    contentDiv.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20">
            <div class="loader w-12 h-12 border-4 border-t-brand-500 mb-4"></div>
            <p class="text-brand-400 animate-pulse font-bold text-lg">AI가 채널을 분석 중입니다...</p>
            <p class="text-slate-500 text-sm mt-2">최근 영상 5개와 성장 지표를 기반으로 전략을 도출합니다.</p>
        </div>
    `;

    try {
        // 3. Fetch Data
        console.log(`[Channel Detail] Fetching analysis for ${channelId}`);
        const response = await fetch(`http://localhost:4000/api/channel-analysis/${channelId}`);
        const data = await response.json();

        if (!data.success) throw new Error(data.error || '분석 실패');

        const { analysis } = data;

        // Find channel basic info from local list to avoid re-fetching
        const channel = (window.currentChannels || []).find(c => c.channelId === channelId) || {
            name: 'Unknown Channel',
            subscribers: 0,
            thumbnail: '',
            totalViews: 0
        };

        // 4. Render Content
        contentDiv.innerHTML = `
            <!-- Header -->
            <div class="flex items-start gap-6 mb-8">
                <img src="${channel.thumbnail}" class="w-24 h-24 rounded-full border-4 border-slate-700 shadow-xl" onerror="this.src='https://placehold.co/100?text=Ch'">
                <div>
                    <h2 class="text-3xl font-bold text-white mb-2">${channel.name}</h2>
                    <div class="flex flex-wrap gap-3 text-sm">
                        <span class="px-3 py-1 bg-slate-700 rounded-full text-slate-300">구독자 ${formatCompactNumber(channel.subscribers)}</span>
                        <span class="px-3 py-1 bg-slate-700 rounded-full text-slate-300">총 조회수 ${formatCompactNumber(channel.totalViews)}</span>
                    </div>
                </div>
            </div>

            <!-- AI Analysis Grid -->
            <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-gradient-to-br from-brand-900/30 to-slate-900 border border-brand-500/30 rounded-2xl p-6 relative overflow-hidden group hover:border-brand-500/50 transition-all">
                    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span class="text-6xl">🎯</span>
                    </div>
                    <h4 class="text-brand-400 font-bold mb-3 flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        왜 이 채널인가?
                    </h4>
                    <p class="text-slate-200 leading-relaxed text-lg">
                        ${analysis.reason_for_selection || '분석 정보가 없습니다.'}
                    </p>
                </div>

                <div class="bg-gradient-to-br from-purple-900/30 to-slate-900 border border-purple-500/30 rounded-2xl p-6 relative overflow-hidden group hover:border-purple-500/50 transition-all">
                    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span class="text-6xl">🚀</span>
                    </div>
                    <h4 class="text-purple-400 font-bold mb-3 flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                        장기 성장 전략
                    </h4>
                    <p class="text-slate-200 leading-relaxed text-lg whitespace-pre-line">
                        ${analysis.long_term_strategy || '전략 정보가 없습니다.'}
                    </p>
                </div>
            </div>

            <!-- Validation Info -->
            <div class="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700 text-center">
                <p class="text-slate-400 text-sm">
                    🤖 이 분석은 Gemini 2.0 Flash가 채널의 최근 퍼포먼스를 기반으로 실시간 생성했습니다.
                </p>
            </div>
        `;

    } catch (error) {
        console.error('[Channel Detail] Error:', error);
        contentDiv.innerHTML = `
            <div class="text-center py-20 text-red-400">
                <p class="text-xl font-bold mb-2">분석 정보를 불러오지 못했습니다.</p>
                <p class="text-sm opacity-80">${error.message}</p>
            </div>
        `;
    }
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
    '비영리/사회운동': '🤝',
    '일반': '🗂️'
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
window.selectCategoryFilterCountry = selectCategoryFilterCountry;
window.searchCategoryFilterDB = searchCategoryFilterDB;
window.switchChannelSubTab = switchChannelSubTab;
window.searchHotChannels = searchHotChannels;
window.renderHotChannelCards = renderHotChannelCards;
window.initMultilangCategories = initMultilangCategories;
window.selectMultilangCategory = selectMultilangCategory;
window.searchMultilangKeywords = searchMultilangKeywords;
window.searchMultilangViralVideos = searchMultilangViralVideos;

console.log('[hot_channel_functions.js] Functions attached to window');
