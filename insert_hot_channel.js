const fs = require('fs');
const path = require('path');

const indexPath = 'index.html';
const content = fs.readFileSync(indexPath, 'utf8');

// Find the insertion point (before </body>)
const insertionMarker = '</body>';
const insertionIndex = content.lastIndexOf(insertionMarker);

if (insertionIndex === -1) {
    console.error('Could not find </body> tag in index.html');
    process.exit(1);
}

// Read the component files
const advancedFilterModal = fs.readFileSync('hot_channel_filter_modal.html', 'utf-8');
const scripts = fs.readFileSync('hot_channel_scripts_to_insert.html', 'utf-8');

// Category Filter Modal HTML
const categoryFilterModal = `
<!-- ========================================
     HOT Channel Finder - Category Filter Modal
     ======================================== -->
<div id="categoryFilterModal" class="fixed inset-0 z-50 hidden" aria-labelledby="category-modal-title" role="dialog" aria-modal="true">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onclick="closeCategoryFilterModal()"></div>

    <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
            <div class="relative transform overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 text-left shadow-2xl transition-all w-full max-w-5xl max-h-[90vh]">
                
                <!-- Modal Header -->
                <div class="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 border-b border-slate-700 flex justify-between items-center sticky top-0 z-10">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-blue-500/10 rounded-lg">
                            <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path>
                            </svg>
                        </div>
                        <h3 class="text-xl font-bold text-white" id="category-modal-title">📂 카테고리 필터</h3>
                        <span class="text-sm text-slate-400 ml-2">(복수 선택 가능)</span>
                    </div>
                    <button onclick="closeCategoryFilterModal()" class="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-800">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <!-- Modal Body -->
                <div class="px-6 py-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <!-- Categories based on reference images -->
                        <button onclick="toggleCategory('entertainment')" id="cat-entertainment" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">엔터테이먼트</button>
                        <button onclick="toggleCategory('game')" id="cat-game" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">게임</button>
                        <button onclick="toggleCategory('vlog')" id="cat-vlog" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">일상/브이로그</button>
                        <button onclick="toggleCategory('food')" id="cat-food" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">음식/먹방</button>
                        <button onclick="toggleCategory('beauty')" id="cat-beauty" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">뷰티/메이크업</button>
                        <button onclick="toggleCategory('sports')" id="cat-sports" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">스포츠</button>
                        <button onclick="toggleCategory('music')" id="cat-music" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">음악</button>
                        <button onclick="toggleCategory('education')" id="cat-education" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">교육</button>
                        <button onclick="toggleCategory('tech')" id="cat-tech" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">과학/기술</button>
                        <button onclick="toggleCategory('news')" id="cat-news" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">뉴스/정치</button>
                        <button onclick="toggleCategory('anime')" id="cat-anime" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">영화/애니</button>
                        <button onclick="toggleCategory('rpg')" id="cat-rpg" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">RPG 게임</button>
                        <button onclick="toggleCategory('adventure')" id="cat-adventure" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">액션 어드벤처</button>
                        <button onclick="toggleCategory('dance')" id="cat-dance" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">댄스 음악</button>
                        <button onclick="toggleCategory('kpop')" id="cat-kpop" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">K-POP</button>
                        <button onclick="toggleCategory('school')" id="cat-school" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">중고등학교</button>
                        <button onclick="toggleCategory('health')" id="cat-health" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">건강</button>
                        <button onclick="toggleCategory('travel')" id="cat-travel" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">여행</button>
                        <button onclick="toggleCategory('asmr')" id="cat-asmr" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">ASMR</button>
                        <button onclick="toggleCategory('fitness')" id="cat-fitness" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">피트니스</button>
                        <button onclick="toggleCategory('fashion')" id="cat-fashion" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">패션</button>
                        <button onclick="toggleCategory('soccer')" id="cat-soccer" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">축구</button>
                        <button onclick="toggleCategory('tv')" id="cat-tv" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">TV 프로그램</button>
                        <button onclick="toggleCategory('comedy')" id="cat-comedy" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">코미디</button>
                        <button onclick="toggleCategory('baseball')" id="cat-baseball" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">야구</button>
                        <button onclick="toggleCategory('cook')" id="cat-cook" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">요리</button>
                        <button onclick="toggleCategory('car')" id="cat-car" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">자동차</button>
                        <button onclick="toggleCategory('review')" id="cat-review" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">리뷰</button>
                        <button onclick="toggleCategory('horror')" id="cat-horror" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">공포</button>
                        <button onclick="toggleCategory('animation')" id="cat-animation" class="category-filter-btn px-4 py-3 rounded-lg bg-slate-700 border-2 border-slate-600 text-slate-300 hover:bg-slate-600 font-medium transition-all text-sm">애니메이션</button>
                    </div>
                </div>

                <!-- Modal Footer -->
                <div class="bg-slate-800/50 px-6 py-4 border-t border-slate-700 flex justify-between items-center gap-3 sticky bottom-0">
                    <button onclick="resetCategoryFilter()" class="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-all">
                        초기화
                    </button>
                    <button onclick="applyCategoryFilter()" class="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]">
                        필터 적용
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
`;

// Combine all components safely without template literal interpolation
// IMPORTANT: Insert modals FIRST, then scripts to avoid HTML inside <script> tags
const componentsToInsert = '\n' + advancedFilterModal + '\n' + categoryFilterModal + '\n' + scripts + '\n';

// Insert the components before </body>
const updatedContent = content.substring(0, insertionIndex) + componentsToInsert + content.substring(insertionIndex);

// Write the updated content back to index.html
fs.writeFileSync(indexPath, updatedContent, 'utf8');

console.log('✅ Successfully inserted HOT Channel Finder components into index.html!');
console.log('📍 Inserted:');
console.log('   - Advanced Filter Modal');
console.log('   - Category Filter Modal');
console.log('   - JavaScript Functions');
console.log('');
console.log('🚀 You can now open index.html in your browser and test the HOT Channel Finder!');
