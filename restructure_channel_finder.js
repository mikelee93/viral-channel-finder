const fs = require('fs');
const indexPath = 'index.html';
const content = fs.readFileSync(indexPath, 'utf8');

const startMarker = '<div id="content-channel-finder" class="tab-content hidden">';
const endMarker = '</div> <!-- End of HOT Channel Finder Tab -->';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error('Markers not found', { startIndex, endIndex });
    process.exit(1);
}

const newContent = `        <div id="content-channel-finder" class="tab-content hidden">
            <!-- HOT Channel Finder Top Navigation -->
            <div class="flex items-center gap-6 mb-8 border-b border-slate-700/50">
                <button onclick="switchChannelSubTab('hot-channels')" id="subtab-hot-channels"
                    class="pb-4 px-2 text-brand-400 border-b-2 border-brand-500 font-bold transition-all">HOT 채널
                    파인더</button>
                <button onclick="switchChannelSubTab('trending-videos')" id="subtab-trending-videos"
                    class="pb-4 px-2 text-slate-400 hover:text-slate-200 border-b-2 border-transparent font-medium transition-all">실시간
                    인기 급상승 파인더</button>
            </div>

            <div id="channel-finder-main-content">
                <!-- Heading -->
                <div class="text-center mb-10">
                    <div class="inline-block p-3 bg-brand-500/10 rounded-2xl mb-4">
                        <span class="text-3xl text-brand-500">🔥</span>
                    </div>
                    <h1 class="text-4xl font-black text-white mb-3 tracking-tighter">HOT 채널 파인더</h1>
                    <p class="text-slate-400 text-lg">구독자 대비 조회수가 폭발적으로 성장하는 <span class="text-brand-400 font-bold">숨은
                            보석</span> 채널을 실시간으로 발굴하세요.</p>
                </div>

                <!-- Filter Bar -->
                <div class="flex flex-wrap items-center gap-3 mb-8">
                    <button onclick="openAdvancedFilterModal()"
                        class="flex items-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-200 font-bold transition-all shadow-lg active:scale-95 group">
                        <svg class="w-5 h-5 text-brand-400 group-hover:rotate-90 transition-transform duration-300"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                            </path>
                        </svg>
                        고급 필터 설정
                    </button>
                    <button onclick="openCategoryFilterModal()"
                        class="flex items-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-200 font-bold transition-all shadow-lg active:scale-95 group">
                        <svg class="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7">
                            </path>
                        </svg>
                        카테고리 필터
                    </button>
                    <div class="relative">
                        <select id="channelSortOrder"
                            class="appearance-none pl-5 pr-12 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-lg">
                            <option value="total_views">정렬: 총 조회수순</option>
                            <option value="growth">정렬: 일일 증감순</option>
                            <option value="subscribers">정렬: 구독자순</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7">
                                </path>
                            </svg>
                        </div>
                    </div>
                    <div class="flex-1 min-w-[300px] relative">
                        <input type="text" id="channelSearchKeyword" placeholder="채널명 검색..."
                            class="w-full bg-slate-900/50 backdrop-blur-sm border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white focus:border-brand-500 outline-none transition-all shadow-inner text-lg">
                        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" fill="none"
                            stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                    </div>
                </div>

                <div class="flex items-center justify-between mb-6 px-1">
                    <div class="text-slate-400 text-sm">
                        발굴된 채널 <span class="text-slate-100 font-extrabold">1,647,660</span> 개 | 📊 통계 조회 <span
                            class="text-brand-400 font-bold">무제한</span>
                    </div>
                    <div class="flex items-center gap-4">
                        <button onclick="searchChannels()"
                            class="px-8 py-3 bg-gradient-to-r from-brand-600 to-red-600 hover:from-brand-500 hover:to-red-500 text-white font-black rounded-xl shadow-xl shadow-brand-900/20 transform transition hover:scale-[1.05] active:scale-95 text-lg">
                            🚀 HOT 채널 찾기
                        </button>
                    </div>
                </div>

                <!-- Channel Cards Container -->
                <div id="channelResultsGrid" class="space-y-6 min-h-[400px]">
                    <!-- Empty State / Loading / Cards will be injected here -->
                    <div class="flex flex-col items-center justify-center py-20 text-slate-600">
                        <svg class="w-20 h-20 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10">
                            </path>
                        </svg>
                        <p class="text-xl font-bold">조건을 설정하고 상단의 'HOT 채널 찾기' 버튼을 클릭하세요.</p>
                    </div>
                </div>
            </div>

            <!-- Trending Videos Main Content (Initially Hidden) -->
            <div id="trending-videos-main-content" class="hidden">
                <div class="text-center mb-10">
                    <div class="inline-block p-3 bg-red-500/10 rounded-2xl mb-4">
                        <span class="text-3xl">📈</span>
                    </div>
                    <h1 class="text-4xl font-black text-white mb-3 tracking-tighter">실시간 인기 급상승</h1>
                    <p class="text-slate-400 text-lg">지금 <span class="text-red-400 font-bold">가장 뜨거운</span> 유튜브 영상을 실시간으로
                        확인하세요.</p>
                </div>

                <div class="flex justify-center mb-8">
                    <div class="bg-slate-800/80 p-1.5 rounded-2xl flex gap-1 shadow-2xl border border-slate-700">
                        <button onclick="switchTrendingFilter('all')" id="trending-filter-all"
                            class="px-8 py-3 rounded-xl bg-brand-600 text-white font-black shadow-lg shadow-brand-900/40 transition-all">전체
                            <span class="ml-2 text-xs opacity-70">600</span></button>
                        <button onclick="switchTrendingFilter('long')" id="trending-filter-long"
                            class="px-8 py-3 rounded-xl text-slate-400 hover:text-white font-bold transition-all">롱폼 <span
                                class="ml-2 text-xs opacity-50">300</span></button>
                        <button onclick="switchTrendingFilter('short')" id="trending-filter-short"
                            class="px-8 py-3 rounded-xl text-slate-400 hover:text-white font-bold transition-all">숏폼 <span
                                class="ml-2 text-xs opacity-50">300</span></button>
                    </div>
                </div>

                <div id="trendingVideosList" class="glass-panel rounded-3xl overflow-hidden border border-slate-700/50">
                    <table class="w-full text-left">
                        <thead class="bg-slate-800/50 border-b border-slate-700">
                            <tr class="text-slate-400 text-sm font-bold">
                                <th class="px-6 py-4 text-center w-20">순위</th>
                                <th class="px-6 py-4">영상 정보</th>
                                <th class="px-6 py-4">채널</th>
                                <th class="px-6 py-4 text-right">조회수</th>
                                <th class="px-6 py-4 text-center w-24">링크</th>
                            </tr>
                        </thead>
                        <tbody id="trendingVideosTableBody" class="divide-y divide-slate-800/50">
                            <!-- Trending items will be injected here -->
                        </tbody>
                    </table>
                </div>
            </div>`;

const updatedContent = content.substring(0, startIndex) + newContent + content.substring(endIndex);
fs.writeFileSync(indexPath, updatedContent, 'utf8');
console.log('Successfully updated index.html with new Channel Finder structure');
