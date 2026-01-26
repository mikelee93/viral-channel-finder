#!/usr/bin/env python
# -*- coding: utf-8 -*-

# HOT Channel Finder HTML을 index.html에 삽입하는 스크립트

html_content = """        </div>
        </div> <!-- End of Video Search Tab -->

        <!-- HOT Channel Finder Tab -->
        <div id="content-channel-finder" class="tab-content hidden">
            <!-- 필터 영역 -->
            <div class="glass-panel rounded-2xl p-6 mb-6">
                <!-- 카테고리 선택 -->
                <div class="mb-4">
                    <label class="block text-sm font-bold text-slate-300 mb-3">
                        📋 카테고리 선택 (다중 선택 가능)
                    </label>
                    <div id="categoryButtons" class="flex flex-wrap gap-2 mb-2">
                        <!-- JavaScript로 동적 생성됨 -->
                    </div>
                </div>

                <!-- 고급 필터 토글 -->
                <button onclick="toggleAdvancedFilters()" class="text-sm text-slate-400 hover:text-brand-400 transition mb-2">
                    ⚙️ 고급 필터
                </button>
                
                <div id="advancedFilters" class="hidden mt-4 space-y-4 bg-slate-800/50 p-4 rounded-xl">
                    <!-- 조회수 기간 -->
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">조회 기간</label>
                        <select id="viewPeriod" class="block w-full py-2 px-3 border border-slate-700 bg-slate-800 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                            <option value="1day">최근 1일</option>
                            <option value="7days" selected>최근 7일</option>
                            <option value="30days">최근 30일</option>
                        </select>
                    </div>

                    <!-- 구독자 범위 -->
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">구독자 범위</label>
                        <div class="flex gap-4 items-center">
                            <input type="number" id="subscriberMin" min="0" max="10000000" value="0" placeholder="최소" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white">
                            <span class="text-slate-500">~</span>
                            <input type="number" id="subscriberMax" min="0" max="10000000" value="10000000" placeholder="최대" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white">
                        </div>
                    </div>

                    <!-- 국가 -->
                    <div>
                        <label class="block text-sm font-medium text-slate-300 mb-2">국가</label>
                        <div class="flex gap-2">
                            <button class="country-btn flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-brand-600 text-slate-300 hover:text-white transition" data-country="KR">🇰🇷 한국</button>
                            <button class="country-btn flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-brand-600 text-slate-300 hover:text-white transition" data-country="US">🇺🇸 미국</button>
                            <button class="country-btn flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-brand-600 text-slate-300 hover:text-white transition" data-country="JP">🇯🇵 일본</button>
                        </div>
                    </div>
                </div>

                <!-- 검색 버튼 -->
                <button onclick="searchChannels()" class="w-full mt-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold py-3 rounded-lg shadow-lg transform transition hover:scale-[1.02] active:scale-[0.98]">
                    🔥 HOT 채널 찾기
                </button>
            </div>

            <!-- 검색 결과 영역 -->
            <div id="channelResults" class="hidden">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white">
                        검색 결과 <span id="channelCount" class="text-brand-400"></span>
                    </h3>
                    <select id="sortBy" class="py-2 px-3 border border-slate-700 bg-slate-800 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="subscribers">구독자 순</option>
                        <option value="views">조회수 순</option>
                        <option value="recent">최근 업로드 순</option>
                    </select>
                </div>
                
                <div id="channelGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <!-- 채널 카드들이 동적으로 추가됨 -->
                </div>
            </div>
        </div> <!-- End of HOT Channel Finder Tab -->
"""

# index.html 파일 읽기
with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1301번 라인 다음에 삽입 (0-indexed이므로 1301)
insert_position = 1301

# 새로운 내용 생성
new_lines = lines[:insert_position] + [html_content + '\n'] + lines[insert_position:]

# 파일에 쓰기
with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("✅ HOT Channel Finder HTML이 성공적으로 추가되었습니다!")
print(f"📍 삽입 위치: 1301번 라인 다음")
