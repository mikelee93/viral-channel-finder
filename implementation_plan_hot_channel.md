# HOT 채널 파인더 통합 개발 구현 계획

## 목표

현재 "소재추출기" 프로그램에 **HOT 채널 파인더** 기능을 새 탭으로 통합하여, 사용자가 바이럴 가능성이 높은 채널을 발견하고 해당 채널의 영상을 분석할 수 있는 통합 워크플로우를 구축합니다.

---

## 주요 변경사항

### 사용자 관점
- **기존**: 키워드로 영상 검색 → 영상 분석
- **추가**: 카테고리/필터로 채널 검색 → 채널의 영상 목록 → 영상 분석

### 기술적 이점
- 채널 단위 바이럴 패턴 학습
- 경쟁 채널 벤치마킹 데이터 축적
- 지속적인 채널 모니터링 가능

---

## 구현 계획

### Phase 1: 탭 네비게이션 시스템 추가

#### [MODIFY] [index.html](file:///f:/Google%20Antigravity/%EC%86%8C%EC%9E%AC%EC%B6%94%EC%B6%9C%EA%B8%B0/index.html)

**변경 위치**: `<!-- Search Section -->` 위에 탭 네비게이션 추가

**추가할 컴포넌트**:
```html
<!-- Tab Navigation -->
<div class="mb-6 border-b border-slate-700">
  <nav class="flex gap-2">
    <button id="tab-video-search" class="tab-btn active">
      🔍 영상 검색
    </button>
    <button id="tab-channel-finder" class="tab-btn">
      🔥 HOT 채널 파인더
    </button>
  </nav>
</div>

<!-- Tab Contents -->
<div id="content-video-search" class="tab-content active">
  <!-- 기존 Search Section 내용 이동 -->
</div>

<div id="content-channel-finder" class="tab-content hidden">
  <!-- 새로운 채널 파인더 섹션 -->
</div>
```

**JavaScript 함수 추가**:
- `switchTab(tabName)`: 탭 전환 로직
- 탭 클릭 이벤트 리스너

---

### Phase 2: 카테고리 및 필터 시스템

#### [MODIFY] [index.html](file:///f:/Google%20Antigravity/%EC%86%8C%EC%9E%AC%EC%B6%94%EC%B6%9C%EA%B8%B0/index.html)

**HOT 채널 파인더 섹션 구조**:

```html
<div id="content-channel-finder" class="tab-content hidden">
  <!-- 필터 영역 -->
  <div class="glass-panel rounded-2xl p-6 mb-6">
    <!-- 카테고리 선택 -->
    <div class="mb-4">
      <label class="block text-sm font-bold text-slate-300 mb-3">
        📋 카테고리 선택 (다중 선택 가능)
      </label>
      <div id="categoryButtons" class="flex flex-wrap gap-2">
        <!-- JavaScript로 동적 생성 -->
      </div>
      <button onclick="openCategoryModal()" class="mt-2 text-brand-400">
        + 더 보기 (전체 카테고리)
      </button>
    </div>

    <!-- 고급 필터 토글 -->
    <button onclick="toggleAdvancedFilters()" class="text-sm text-slate-400">
      ⚙️ 고급 필터
    </button>
    
    <div id="advancedFilters" class="hidden mt-4 space-y-4">
      <!-- 조회수 기간 -->
      <div>
        <label>조회 기간</label>
        <select id="viewPeriod">
          <option value="1day">최근 1일</option>
          <option value="7days" selected>최근 7일</option>
          <option value="30days">최근 30일</option>
        </select>
      </div>

      <!-- 구독자 범위 -->
      <div>
        <label>구독자 범위</label>
        <input type="range" id="subscriberMin" min="0" max="10000000">
        <input type="range" id="subscriberMax" min="0" max="10000000">
      </div>

      <!-- 국가 -->
      <div>
        <label>국가</label>
        <div class="flex gap-2">
          <button class="country-btn" data-country="KR">🇰🇷 한국</button>
          <button class="country-btn" data-country="US">🇺🇸 미국</button>
          <button class="country-btn" data-country="JP">🇯🇵 일본</button>
        </div>
      </div>
    </div>

    <!-- 검색 버튼 -->
    <button onclick="searchChannels()" class="w-full mt-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold py-3 rounded-lg">
      🔥 HOT 채널 찾기
    </button>
  </div>

  <!-- 검색 결과 영역 -->
  <div id="channelResults" class="hidden">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-xl font-bold text-white">
        검색 결과 <span id="channelCount" class="text-brand-400"></span>
      </h3>
      <select id="sortBy">
        <option value="subscribers">구독자 순</option>
        <option value="views">조회수 순</option>
        <option value="recent">최근 업로드 순</option>
      </select>
    </div>
    
    <div id="channelGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- 채널 카드들이 동적으로 추가됨 -->
    </div>
  </div>
</div>
```

**카테고리 데이터 정의** (JavaScript):
```javascript
const CHANNEL_CATEGORIES = [
  { id: 'entertainment', name: '엔터테인먼트', icon: '🎬', count: 186856 },
  { id: 'game', name: '게임/e스포츠', icon: '🎮', count: 158241 },
  { id: 'vlog', name: '일상/브이로그', icon: '📹', count: 191327 },
  { id: 'food', name: '음식/먹방', icon: '🍜', count: 225190 },
  { id: 'beauty', name: '뷰티/메이크업', icon: '💄', count: 56910 },
  // ... 30개 이상의 카테고리
];
```

---

### Phase 3: 백엔드 API 개발

#### [MODIFY] [server.js](file:///f:/Google%20Antigravity/%EC%86%8C%EC%9E%AC%EC%B6%94%EC%B6%9C%EA%B8%B0/server.js)

**새 엔드포인트 추가**:

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// API: Search Channels (HOT Channel Finder)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/search-channels', async (req, res) => {
    try {
        const { 
            categories,      // 선택된 카테고리 배열
            subscriberMin,   // 최소 구독자
            subscriberMax,   // 최대 구독자
            viewPeriod,      // 조회 기간 (1day, 7days, 30days)
            country,         // 국가 코드
            sortBy           // 정렬 기준
        } = req.body;

        console.log('[Channel Search] Filters:', req.body);

        // YouTube Data API - Search 호출
        const searchQueries = categories.map(cat => 
            CATEGORY_KEYWORDS[cat] || cat
        );

        let allChannels = [];

        for (const query of searchQueries) {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
                `part=snippet&type=channel&q=${encodeURIComponent(query)}` +
                `&maxResults=50&regionCode=${country || 'KR'}` +
                `&key=${YOUTUBE_API_KEY}`;

            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (searchData.items) {
                // 채널 상세 정보 가져오기
                const channelIds = searchData.items
                    .map(item => item.snippet.channelId)
                    .join(',');

                const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?` +
                    `part=snippet,statistics,contentDetails` +
                    `&id=${channelIds}&key=${YOUTUBE_API_KEY}`;

                const channelsRes = await fetch(channelsUrl);
                const channelsData = await channelsRes.json();

                allChannels = allChannels.concat(channelsData.items || []);
            }
        }

        // 필터링
        let filteredChannels = allChannels.filter(channel => {
            const subscriberCount = parseInt(channel.statistics.subscriberCount);
            
            if (subscriberMin && subscriberCount < subscriberMin) return false;
            if (subscriberMax && subscriberCount > subscriberMax) return false;
            
            return true;
        });

        // 정렬
        filteredChannels.sort((a, b) => {
            if (sortBy === 'subscribers') {
                return parseInt(b.statistics.subscriberCount) - parseInt(a.statistics.subscriberCount);
            } else if (sortBy === 'views') {
                return parseInt(b.statistics.viewCount) - parseInt(a.statistics.viewCount);
            }
            return 0;
        });

        // 중복 제거 (channelId 기준)
        const uniqueChannels = Array.from(
            new Map(filteredChannels.map(ch => [ch.id, ch])).values()
        );

        res.json({
            success: true,
            channels: uniqueChannels,
            count: uniqueChannels.length
        });

    } catch (error) {
        console.error('[Channel Search Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 카테고리 → 검색 키워드 매핑
const CATEGORY_KEYWORDS = {
    'entertainment': '엔터테인먼트 예능',
    'game': '게임 e스포츠',
    'vlog': '일상 브이로그',
    'food': '먹방 음식',
    // ... 추가
};
```

**추가 엔드포인트**: 채널의 최근 영상 가져오기
```javascript
app.post('/api/channel-videos', async (req, res) => {
    try {
        const { channelId, maxResults = 20 } = req.body;

        // 채널의 최근 업로드 영상 가져오기
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
            `part=snippet&channelId=${channelId}&order=date` +
            `&type=video&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;

        const response = await fetch(searchUrl);
        const data = await response.json();

        res.json({ success: true, videos: data.items || [] });

    } catch (error) {
        console.error('[Channel Videos Error]', error);
        res.status(500).json({ error: error.message });
    }
});
```

---

### Phase 4: 검색 결과 표시

#### [MODIFY] [index.html](file:///f:/Google%20Antigravity/%EC%86%8C%EC%9E%AC%EC%B6%95%EC%B6%9C%EA%B8%B0/index.html)

**JavaScript 함수 추가**:

```javascript
// 채널 검색 실행
async function searchChannels() {
    const categories = getSelectedCategories();
    const subscriberMin = document.getElementById('subscriberMin')?.value || 0;
    const subscriberMax = document.getElementById('subscriberMax')?.value || 10000000;
    const viewPeriod = document.getElementById('viewPeriod')?.value || '7days';
    const country = getSelectedCountry() || 'KR';
    const sortBy = document.getElementById('sortBy')?.value || 'subscribers';

    // 로딩 표시
    const resultsDiv = document.getElementById('channelResults');
    const gridDiv = document.getElementById('channelGrid');
    
    resultsDiv.classList.remove('hidden');
    gridDiv.innerHTML = `
        <div class="col-span-full flex justify-center py-12">
            <div class="loader"></div>
            <p class="ml-4 text-slate-400">채널을 검색하는 중...</p>
        </div>
    `;

    try {
        const response = await fetch('http://localhost:4000/api/search-channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                categories,
                subscriberMin: parseInt(subscriberMin),
                subscriberMax: parseInt(subscriberMax),
                viewPeriod,
                country,
                sortBy
            })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        // 결과 표시
        displayChannelResults(data.channels);
        document.getElementById('channelCount').textContent = 
            `(${data.count.toLocaleString()}개 채널)`;

    } catch (error) {
        console.error('Channel search error:', error);
        gridDiv.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-red-400">검색 중 오류 발생: ${error.message}</p>
            </div>
        `;
    }
}

// 채널 결과 표시
function displayChannelResults(channels) {
    const gridDiv = document.getElementById('channelGrid');
    
    if (!channels || channels.length === 0) {
        gridDiv.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-slate-400">검색 결과가 없습니다.</p>
            </div>
        `;
        return;
    }

    gridDiv.innerHTML = channels.map(channel => `
        <div class="glass-panel rounded-xl p-4 hover:border-brand-500 transition cursor-pointer"
             onclick="openChannelModal('${channel.id}', '${escapeHtml(channel.snippet.title)}')">
            <!-- 채널 썸네일 -->
            <img src="${channel.snippet.thumbnails.medium.url}" 
                 class="w-20 h-20 rounded-full mx-auto mb-3"
                 alt="${escapeHtml(channel.snippet.title)}">
            
            <!-- 채널명 -->
            <h4 class="text-white font-bold text-center mb-2 truncate">
                ${escapeHtml(channel.snippet.title)}
            </h4>
            
            <!-- 통계 -->
            <div class="text-sm text-slate-400 space-y-1">
                <div class="flex justify-between">
                    <span>구독자</span>
                    <span class="text-brand-400 font-bold">
                        ${formatNumber(channel.statistics.subscriberCount)}
                    </span>
                </div>
                <div class="flex justify-between">
                    <span>총 조회수</span>
                    <span class="text-slate-300">
                        ${formatNumber(channel.statistics.viewCount)}
                    </span>
                </div>
                <div class="flex justify-between">
                    <span>영상 수</span>
                    <span class="text-slate-300">
                        ${formatNumber(channel.statistics.videoCount)}
                    </span>
                </div>
            </div>

            <!-- 분석 버튼 -->
            <button class="w-full mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-2 rounded-lg">
                영상 보기
            </button>
        </div>
    `).join('');
}

// 숫자 포맷팅 헬퍼
function formatNumber(num) {
    const n = parseInt(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
}
```

---

### Phase 5: 기존 기능 연계

#### [MODIFY] [index.html](file:///f:/Google%20Antigravity/%EC%86%8C%EC%9E%AC%EC%B6%94%EC%B6%9C%EA%B8%B0/index.html)

**채널 클릭 시 영상 목록 모달**:

```javascript
async function openChannelModal(channelId, channelName) {
    // 기존 analysisModal 재사용
    openModal();
    
    const modalContent = document.getElementById('modalContent');
    
    modalContent.innerHTML = `
        <div class="flex items-center justify-center py-8">
            <div class="loader"></div>
            <p class="ml-4 text-brand-400">${channelName}의 최근 영상을 불러오는 중...</p>
        </div>
    `;

    try {
        const response = await fetch('http://localhost:4000/api/channel-videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, maxResults: 20 })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        // 영상 목록 표시
        modalContent.innerHTML = `
            <div class="space-y-4">
                <h3 class="text-xl font-bold text-white mb-4">
                    ${escapeHtml(channelName)} - 최근 영상
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto">
                    ${data.videos.map(video => `
                        <div class="bg-slate-800/50 rounded-lg p-3 hover:bg-slate-700/50 transition cursor-pointer"
                             onclick="reprocessVideo('${video.id.videoId}', '${escapeHtml(video.snippet.title).replace(/'/g, "\\'")}')">
                            <img src="${video.snippet.thumbnails.medium.url}" 
                                 class="w-full rounded mb-2"
                                 alt="${escapeHtml(video.snippet.title)}">
                            <h4 class="text-sm font-bold text-white line-clamp-2 mb-1">
                                ${escapeHtml(video.snippet.title)}
                            </h4>
                            <p class="text-xs text-slate-400">
                                ${new Date(video.snippet.publishedAt).toLocaleDateString()}
                            </p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

    } catch (error) {
        console.error('Channel videos error:', error);
        modalContent.innerHTML = `
            <div class="text-center py-8">
                <p class="text-red-400">영상 목록을 불러오지 못했습니다: ${error.message}</p>
            </div>
        `;
    }
}
```

기존 `reprocessVideo()` 함수가 호출되어 댓글/자막 분석 → 대본 재작성 워크플로우로 자연스럽게 연결됩니다.

---

## 검증 계획

### 기능 테스트
1. **탭 전환**: 영상 검색 ↔ HOT 채널 파인더 전환이 원활한지
2. **필터 조합**: 다양한 필터 조합으로 검색 결과가 정확한지
3. **API 쿼터**: YouTube API 호출이 효율적인지 (중복 제거, 캐싱)
4. **워크플로우**: 채널 선택 → 영상 선택 → 분석이 끊김 없이 진행되는지

### 성능 테스트
- 50개 채널 검색 시 응답 시간 < 3초
- 채널 카드 렌더링 속도
- 모바일/태블릿 반응형 확인

---

## 배포 전 체크리스트

- [ ] API 키 보안 (서버에서만 사용)
- [ ] 에러 처리 (API 실패, 네트워크 오류 등)
- [ ] 로딩 상태 표시
- [ ] 빈 결과 처리
- [ ] 브라우저 호환성 (Chrome, Firefox, Safari)
- [ ] 모바일 레이아웃 최적화

---

## 향후 확장 기능 (Optional)

1. **채널 저장/북마크**
   - 관심 채널을 저장하여 나중에 다시 보기
   - Google Sheets에 북마크 채널 저장

2. **성장률 분석**
   - 채널의 최근 성장 추이 그래프
   - 급성장 채널 알림

3. **경쟁 채널 비교**
   - 여러 채널의 통계 비교 테이블
   - 벤치마킹 리포트 생성

4. **자동 모니터링**
   - 특정 카테고리의 신규 급성장 채널 자동 탐지
   - 주간 리포트 이메일 발송
