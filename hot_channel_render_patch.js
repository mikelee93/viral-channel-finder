// Render HOT Channel Cards (Reference UI Style)
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
                            <div class="relative aspect-video bg-slate-900 rounded-lg overflow-hidden group/thumb">
                                <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}" 
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
                            <div class="aspect-video bg-slate-900/50 rounded-lg flex items-center justify-center">
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
