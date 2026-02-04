// ═══════════════════════════════════════════════════════════════════════════
// 국가별 × 카테고리별 × 연령별 로컬라이징 프롬프트 시스템
// ═══════════════════════════════════════════════════════════════════════════

function getLocalizedPrompt(targetCountry, scriptCategory, targetAge, title, comments, transcript, viralContext) {
    // 1. 국가별 기본 설정
    const countrySettings = {
        KR: {
            speed: '빠른 편집 (1초당 5-7자)',
            textDensity: '자막 정보량 많음 (화면 가득 채워도 OK)',
            tone: '자연스러운 구어체/직설적 (Youtube Vlog Style)',
            memeStyle: '한국 커뮤니티 밈 (디시, 에펨코, 인스타 릴스)',
            numberStyle: '구체적 숫자 강조 (95%, 월 300, 3가지)',
            urgency: '놓치면 손해, 무조건, 절대, 진짜로',
            styleNote: '🚨 번역투 금지 ("~하였습니다", "~입니다" 지양). 유튜버가 말하듯 "아니,", "근데,", "솔직히," 같은 추임새(Filler) 활용. 어미 다양화 (~했거든요, ~거든요, ~죠)'
        },
        JP: {
            speed: '중간 템포 (1초당 3-5자)',
            textDensity: '짧고 정갈 (여백 중요)',
            tone: '自然な話し言葉/親近感 (Tameguchi/Casual)',
            memeStyle: '서브컬처/게임/애니 레퍼런스 (草, w, リアクション)',
            numberStyle: '은근한 숫자 제시 (意外と, 実は)',
            urgency: 'おすすめ, 簡単, 便利, まじで',
            styleNote: '🚨 ロボット口調禁止 ("〜です/ます" 乱用禁止)。友達と話すような "タメ口" 推奨 ("〜だよね", "〜じゃん", "〜なんだけど"). 感嘆詞 ("え、", "待って、", "やば") を自然に入れる。'
        },
        US: {
            speed: '매우 빠른 편집 (1초당 8-10자, 짧은 영어 단어)',
            textDensity: '핵심만 (3-5단어 짧은 문장)',
            tone: '과장된 리액션 / 에너지 넘침',
            memeStyle: 'TikTok 트렌드, Gen-Z slang (NO CAP, FR FR)',
            numberStyle: '충격적 비교 (1% vs 99%, RICH vs BROKE)',
            urgency: 'YOU NEED THIS, LIFE HACK, MIND BLOWN'
        }
    };

    // 2. 카테고리별 템플릿 (국가별로 완전히 다름!)
    const templates = {
        // === 정보형 카테고리 ===
        info: {
            KR: `
### 📊 정보형 쇼츠 - 한국 버전 (${targetAge === 'teen' ? '10대' : targetAge === '20s' ? '20대' : '30대+'} 타겟)

**핵심 구조**: 숫자 제시 → 3가지 나열 (점점 강해짐) → 마지막 1개 반전

**예시 패턴**:
${targetAge === 'teen' ?
                    '- "중고생 95%가 모르는 공부법 3개"\n- "성적 올리는 애들 특징 3가지"' :
                    targetAge === '20s' ?
                        '- "취준생 90%가 놓치는 면접 꿀팁 3개"\n- "월급 300 vs 30만원 차이 3가지"' :
                        '- "직장인 대부분이 모르는 세금 환급 3개"\n- "연봉 협상 잘하는 사람 특징 3가지"'
                }

**스크립트 구조** (총 500-800자):
[0-2초] "이거 모르면 손해봅니다" (강렬한 후킹)
[3-10초] "1번째: OO / 2번째: XX / 3번째: △△" (빠르게 나열)
[10-15초] "그런데 진짜는..." (반전 시그널)
[15-20초] "바로 이겁니다" (핵심 1개 강조)
[20-25초] "댓글로 알려주세요" (CTA)

**톤**: 직설적, 숫자 강조, "손해", "무조건", "절대" 같은 강한 표현
**자막**: 화면 가득, 중요 단어는 색깔 변경 (빨강, 노랑)
**편집**: 1초에 1컷, 빠른 전환
            `,
            JP: `
### 📊 情報型ショート - 日本版 (${targetAge === 'teen' ? '10代' : targetAge === '20s' ? '20代' : '30代+'} ターゲット)

**核心構造**: 疑問提起 → 3つの理由 → 驚きの結論

**例パターン**:
${targetAge === 'teen' ?
                    '- "学生の95%が知らない勉強のコツ"\n- "成績が上がる人の3つの習慣"' :
                    targetAge === '20s' ?
                        '- "就活生90%が見落とす面接術"\n- "貯金できる人vs.できない人の差"' :
                        '- "会社員のほとんどが知らない節税術"\n- "昇給交渉が上手い人の特徴3つ"'
                }

**スクリプト構造** (計500-800字):
[0-2秒] "これ、知ってましたか？" (柔らかい疑問)
[3-10秒] "理由は3つあります..." (丁寧に提示)
[10-15秒] "でも、実は..." (意外な展開)
[15-20秒] "これが一番大事なんです" (結論)
[20-25秒] "コメントで教えてください" (CTA)

**トーン**: 丁寧、驚き強調、"実は"、"意外と" など柔らかい表現
**字幕**: 短く整理、余白重視、パステルカラー
**編集**: 中速テンポ、ゆとりあるカット
            `,
            US: `
### 📊 Info Shorts - US Version (${targetAge === 'teen' ? 'Gen-Z' : targetAge === '20s' ? 'College/Young Adult' : 'Professionals'} Target)

**Core Structure**: SHOCKING STAT → 3 FAST TIPS → MIND-BLOWN REVEAL

**Example Patterns**:
${targetAge === 'teen' ?
                    '- "95% of students DON\'T KNOW this study hack"\n- "Kids who ACE tests do these 3 things"' :
                    targetAge === '20s' ?
                        '- "90% of job seekers MISS this interview trick"\n- "People making $100K vs $30K: The difference"' :
                        '- "Most adults DON\'T KNOW this tax refund hack"\n- "People who negotiate salary: 3 secrets"'
                }

**Script Structure** (Total 500-800 chars):
[0-2s] "NO WAY THIS IS REAL" (Instant hook)
[3-10s] "Number 1: [BOOM] / Number 2: [CRAZY] / Number 3: [INSANE]"
[10-15s] "But wait... the REAL secret is..."
[15-20s] "THIS. RIGHT HERE." (Emphasize THE one thing)
[20-25s] "Comment which one you knew!" (CTA)

**Tone**: HYPED, FAST, EXAGGERATED reactions ("FR FR", "NO CAP", "DEAD")
**Captions**: ALL CAPS for emphasis, fast pop-ups, neon colors
**Editing**: 0.5-1s per cut, zoom-ins, dramatic transitions
            `
        },

        // === 돈/재테크 카테고리 ===
        money: {
            KR: `
### 💰 돈/재테크 - 한국판 (${targetAge === 'teen' ? '10대' : targetAge === '20s' ? '20대' : '30대+'} 타겟)

**핵심 구조**: 충격적 금액 비교 → 차이 3가지 → "이것만" 팁

**예시 패턴**:
${targetAge === 'teen' ?
                    '- "용돈 받고도 모으는 애들 특징"\n- "알바비 10만원 차이 나는 이유"' :
                    targetAge === '20s' ?
                        '- "월급 300만원 vs 30만원 차이 3가지"\n- "20대 부자들이 하는 것 vs 안 하는 것"' :
                        '- "연봉 5천 vs 1억 차이는 딱 이것"\n- "40대 자산 10억 만든 사람들 공통점"'
                }

**스크립트 구조**:
[0-2초] "월급 300 vs 30만원, 차이가 뭘까요?"
[3-10초] "1. OO을 절대 안 함 / 2. XX에 투자 / 3. △△ 습관"
[10-15초] "특히 이건 절대..."
[15-20초] "이것만 바꾸면 됩니다"
[20-25초] "당신은 어느 쪽? 댓글로"

**핵심**: 구체적 금액 강조, "절대", "무조건", 즉각 실행 가능한 팁
**톤**: 강한 단언, 비교 그래픽 활용
            `,
            JP: `
### 💰 お金/節約 - 日本版 (${targetAge === 'teen' ? '10代' : targetAge === '20s' ? '20代' : '30代+'} ターゲット)

**核心構造**: 貯金できる人の秘密 → 3つの習慣 → 意外と簡単な結論

**例パターン**:
${targetAge === 'teen' ?
                    '- "お小遣いでも貯金できる学生の特徴"\n- "バイト代に差が出る理由"' :
                    targetAge === '20s' ?
                        '- "月30万円貯金できる人の特徴3つ"\n- "20代でお金が貯まる人vs.貯まらない人"' :
                        '- "年収500万vs1000万の違いはこれ"\n- "40代で資産1億作った人の共通点"'
                }

**スクリプト構造**:
[0-2秒] "貯金、できてますか？"
[3-10秒] "実は3つのコツがあります..."
[10-15秒] "特にこれは意外と..."
[15-20秒] "簡単にできるんです"
[20-25秒] "あなたはどっち？コメントで"

**핵심**: 부드러운 제안, "おすすめ", "簡単", 안전한 방법
**トーン**: 優しいアドバイス、グラフや図解活用
            `,
            US: `
### 💰 Money/Finance - US Version (${targetAge === 'teen' ? 'Gen-Z' : targetAge === '20s' ? 'Young Adults' : 'Professionals'} Target)

**Core Structure**: RICH vs BROKE COMPARISON → THE 3 DIFFERENCES → LIFE-CHANGING TIP

**Example Patterns**:
${targetAge === 'teen' ?
                    '- "Kids who SAVE their allowance do THIS"\n- "Part-time jobs: $10 vs $100 difference"' :
                    targetAge === '20s' ?
                        '- "People making $10K/month vs $1K: The 3 SECRETS"\n- "Rich 20-year-olds do THIS, broke ones don\'t"' :
                        '- "Making $50K vs $200K: The ONE thing"\n- "People with $1M by 40: What they did"'
                }

**Script Structure**:
[0-2s] "RICH vs BROKE: The REAL difference"
[3-10s] "1. They NEVER do [X] / 2. They invest in [Y] / 3. This ONE habit"
[10-15s] "But the CRAZIEST part..."
[15-20s] "JUST. DO. THIS."
[20-25s] "Which one are YOU? Comment!"

**Key**: Specific dollar amounts, "GAME CHANGER", "NO CAP", instant actionable
**Tone**: HYPED comparison, side-by-side graphics
            `
        },

        // === 연애/관계 카테고리 ===
        love: {
            KR: `
### 💕 연애/관계 - 한국판 (${targetAge === 'teen' ? '10대' : targetAge === '20s' ? '20대' : '30대+'} 타겟)

**핵심 구조**: 공감 상황 → 숨겨진 신호 3가지 → 핵심 팁

**예시 패턴**:
${targetAge === 'teen' ?
                    '- "관심 있는 애가 보내는 신호 3가지"\n- "친구? 썸? 구분하는 법"' :
                    targetAge === '20s' ?
                        '- "헤어지기 직전 신호 3가지"\n- "진심으로 좋아하는 사람 vs 그냥 심심한 사람"' :
                        '- "오래가는 커플 vs 빨리 헤어지는 커플 차이"\n- "결혼 생각하는 사람이 하는 행동 3가지"'
                }

**스크립트 구조**:
[0-2초] "이런 행동 하면... 진짜입니다"
[3-10초] "신호 1: OO / 신호 2: XX / 신호 3: △△"
[10-15초] "특히 이건 확실한 거..."
[15-20초] "당신 상황은?"
[20-25초] "댓글로 공유해주세요"

**핵심**: 공감 유발, "나만 그런 줄", 구체적 행동 예시
**톤**: 친근하게, 비밀 알려주듯이
            `,
            JP: `
### 💕 恋愛/関係 - 日本版 (${targetAge === 'teen' ? '10代' : targetAge === '20s' ? '20代' : '30代+'} ターゲット)

**核心構造**: 共感できる状況 → 隠れたサイン3つ → 核心ヒント

**例パターン**:
${targetAge === 'teen' ?
                    '- "好きな人が見せる脈ありサイン3つ"\n- "友達？それとも好き？見分け方"' :
                    targetAge === '20s' ?
                        '- "別れる直前のサイン3つ"\n- "本気で好きな人vs.ただ寂しい人"' :
                        '- "長続きするカップルvs.すぐ別れるカップル"\n- "結婚を考えてる人の行動3つ"'
                }

**スクリプト構造**:
[0-2秒] "こんな行動したら... 本気です"
[3-10秒] "サイン1: OO / サイン2: XX / サイン3: △△"
[10-15秒] "特にこれは確実なんです..."
[15-20秒] "あなたの状況は？"
[20-25秒] "コメントでシェアして"

**핵心**: 공감 유발, "自分だけ？", 구체적 행동 예시
**トーン**: 友達に教える感じ、優しく
            `,
            US: `
### 💕 Love/Dating - US Version (${targetAge === 'teen' ? 'Gen-Z' : targetAge === '20s' ? 'Young Adults' : 'Adults'} Target)

**Core Structure**: RELATABLE situation → THE 3 HIDDEN SIGNS → BRUTAL TRUTH

**Example Patterns**:
${targetAge === 'teen' ?
                    '- "Your crush does THIS if they like you"\n- "Friend zone vs. They\'re INTO you"' :
                    targetAge === '20s' ?
                        '- "3 signs they\'re about to DUMP you"\n- "Really into you vs. Just bored"' :
                        '- "Couples that LAST vs. couples that DON\'T"\n- "They\'re thinking marriage if they do THESE 3 things"'
                }

**Script Structure**:
[0-2s] "If they do THIS... it's REAL"
[3-10s] "Sign 1: [OMG] / Sign 2: [STOP] / Sign 3: [FACTS]"
[10-15s] "But THIS one... no cap"
[15-20s] "Where are YOU at?"
[20-25s] "Spill in the comments"

**Key**: Relatable AF, "Am I the only one?", specific behavior examples
**Tone**: Like telling your bestie a secret
            `
        },

        // === 공부/입시 카테고리 ===
        study: {
            KR: `
### 📚 공부/입시 - 한국판 (${targetAge === 'teen' ? '10대' : targetAge === '20s' ? '20대' : '30대+'} 타겟)

**핵심 구조**: 충격적 성적 비교 → 차이 3가지 → 즉각 실행 팁

**예시 패턴**:
${targetAge === 'teen' ?
                    '- "성적 1등급 vs 5등급 차이는 딱 이것"\n- "공부 잘하는 애들이 절대 안 하는 것 3가지"' :
                    targetAge === '20s' ?
                        '- "토익 900 vs 400 차이 3가지"\n- "합격하는 자소서 vs 떨어지는 자소서"' :
                        '- "MBA 합격하는 사람 vs 탈락하는 사람"\n- "승진 빠른 사람 공부법 3가지"'
                }

**스크립트 구조**:
[0-2초] "1등급 vs 5등급, 차이가 뭘까?"
[3-10초] "1. 절대 OO 안 함 / 2. XX만 3번 / 3. △△ 습관"
[10-15초] "특히 이건 무조건..."
[15-20초] "오늘부터 바로 해보세요"
[20-25초] "당신 성적은? 댓글로"

**핵심**: 성적/점수 구체적 제시, "무조건", "절대", 즉각 실행 가능
**톤**: 단언적, 동기부여
            `,
            JP: `
### 📚 勉強/受験 - 日本版 (${targetAge === 'teen' ? '10代' : targetAge === '20s' ? '20代' : '30代+'} ターゲット)

**核心構造**: 成績の差の理由 → 3つの違い → 今すぐできるヒント

**例パターン**:
${targetAge === 'teen' ?
                    '- "成績トップvs.平均点の差はこれ"\n- "勉強できる人が絶対しないこと3つ"' :
                    targetAge === '20s' ?
                        '- "TOEIC900vs.400の違い3つ"\n- "合格する志望理由書vs.落ちる書き方"' :
                        '- "MBA合格する人vs.落ちる人"\n- "昇進が早い人の勉強法3つ"'
                }

**スクリプト構造**:
[0-2秒] "トップvs.平均、何が違う？"
[3-10秒] "1. OOは絶対しない / 2. XXだけ3回 / 3. △△の習慣"
[10-15秒] "特にこれは必ず..."
[15-20秒] "今日から試してみて"
[20-25秒] "あなたの成績は？コメントで"

**핵심**: 성적/점수 은근히 제시, "おすすめ", "効果的", 실천 가능
**トーン**: 励まし、優しいアドバイス
            `,
            US: `
### 📚 Study/School - US Version (${targetAge === 'teen' ? 'Students' : targetAge === '20s' ? 'College/Grads' : 'Professionals'} Target)

**Core Structure**: SHOCKING GRADE COMPARISON → THE 3 DIFFERENCES → DO THIS NOW

**Example Patterns**:
${targetAge === 'teen' ?
                    '- "Straight-A students vs. C students: The REAL difference"\n- "Smart kids NEVER do these 3 things"' :
                    targetAge === '20s' ?
                        '- "People who ACE the LSAT vs. those who bomb it"\n- "Resumes that get HIRED vs. ones that get IGNORED"' :
                        '- "People who get into MBA programs vs. those who don\'t"\n- "Fast-track promotion: 3 study hacks"'
                }

**Script Structure**:
[0-2s] "A+ students vs. C students: THIS is why"
[3-10s] "1. They NEVER do [X] / 2. Only [Y] 3 times / 3. THIS habit"
[10-15s] "But THIS one... game changer"
[15-20s] "Start TODAY"
[20-25s] "What's YOUR grade? Drop it!"

**Key**: Specific grades/scores, "MUST DO", "NO EXCUSES", instant actionable
**Tone**: Motivational, hyped
            `
        },

        // === 유머/밈 카테고리 ===
        humor: {
            KR: `
### 😂 유머/밈 - 한국판 (${targetAge === 'teen' ? '10대' : targetAge === '20s' ? '20대' : '30대+'} 타겟)

**핵심 구조**: 평범한 시작 → 점점 이상해짐 → 완전 뒤집기

**밈 활용**:
- 한국 커뮤니티 유행어 (ㄹㅇㅋㅋ, 레전드, 역대급, 개웃김, 실화냐)
- 과장된 반응 자막 ("미쳤다", "ㅋㅋㅋㅋㅋㅋㅋㅋ", "아니 얘 왜케")

**스크립트 예시**:
[0-2초] "평범한 하루였습니다..." (잔잔)
[3-8초] "그런데 이 사람이... ㅋㅋㅋ" (이상 신호)
[8-15초] "갑자기 ㅋㅋㅋㅋㅋㅋㅋㅋㅋ" (폭발)
[15-20초] "결과: 레전드 등극 ㅋㅋㅋ" (결말)
[20-25초] "공감 ㅋㅋ 댓글로"

**톤**: 빠른 템포, 짧은 자막, 이모지 많이, 오버 리액션
**편집**: 0.5초마다 컷, 줌인/아웃 남발, 효과음 강조
            `,
            JP: `
### 😂 ユーモア/ミーム - 日本版 (${targetAge === 'teen' ? '10代' : targetAge === '20s' ? '20代' : '30代+'} ターゲット)

**核心構造**: 普通の始まり → 少しずつおかしく → ギャップ萌え

**ミーム活用**:
- アニメ・ゲーム用語、ネットスラング (草、やばい、エモい、しか勝たん)
- かわいいリアクション ("え、待って", "まじで？", "www")

**スクリプト例**:
[0-2秒] "普通の一日でした..." (穏やか)
[3-8秒] "でも、この人が...w" (変な気配)
[8-15秒] "まさかのwwww" (展開)
[15-20秒] "結果: 伝説誕生www" (結末)
[20-25秒] "共感したらコメント"

**トーン**: 中速テンポ、かわいいリアクション、ギャップ重視
**編集**: ゆとりあるカット、パステルエフェクト
            `,
            US: `
### 😂 Humor/Meme - US Version (${targetAge === 'teen' ? 'Gen-Z' : targetAge === '20s' ? 'Millennials/Gen-Z' : 'Adults'} Target)

**Core Structure**: Normal start → Gets WEIRD → COMPLETE CHAOS

**Meme Usage**:
- Gen-Z slang (NO CAP, FR FR, DEAD, FOUL, UNHINGED, NOT THE...)
- Exaggerated reactions ("BRO WHAT", "NAHHH", "I'M DONE 💀")

**Script Example**:
[0-2s] "Just a normal day..." (calm)
[3-8s] "But then this dude... BRO" (red flag)
[8-15s] "NAHHHH 💀💀💀" (chaos)
[15-20s] "The result: LEGENDARY 💀" (finale)
[20-25s] "If you relate DROP A 💀"

**Tone**: CHAOTIC, fast cuts, emojis everywhere, OVER-THE-TOP reactions
**Editing**: 0.3s per cut, zooms, sound effects LOUD
            `
        },

        // === 실험/챌린지 카테고리 ===
        challenge: {
            KR: `
### 🎯 실험/챌린지 - 한국판

**핵심 구조**: 미스터비스트식 "점점 에스컬레이션" → 20초로 압축

**예시 패턴**:
- "1시간 → 100시간 버티기"
- "1원 → 1000만원 쓰기"
- "레벨 1 → 레벨 100 난이도"

**스크립트 구조**:
[0-2초] "레벨 1부터 시작합니다"
[3-8초] "레벨 10... 레벨 50... 점점 미쳐갑니다"
[8-15초] "레벨 99... 이건 진짜..."
[15-20초] "최종 레벨 100!!!" (클라이맥스)
[20-25초] "당신은 몇 레벨까지? 댓글"

**핵심**: 숫자 증가 강조, 긴장감 UP, 빠른 편집
**톤**: 과장, 극적, 숫자 시각화
            `,
            JP: `
### 🎯 実験/チャレンジ - 日本版

**核心構造**: 段階的エスカレーション → 20秒で要約

**例パターン**:
- "1時間 → 100時間耐久"
- "1円 → 1000万円使う"
- "レベル1 → レベル100難易度"

**スクリプト構造**:
[0-2秒] "レベル1から始めます"
[3-8秒] "レベル10...レベル50...だんだん大変に"
[8-15秒] "レベル99...これは本当に..."
[15-20秒] "最終レベル100!!!" (クライマックス)
[20-25秒] "あなたは何レベルまで？コメントで"

**핵심**: 단계 증가 강조, 긴장감, 적당한 편집
**トーン**: 興奮、数字の視覚化
            `,
            US: `
### 🎯 Challenge/Experiment - US Version

**Core Structure**: MrBeast-style "ESCALATION" → Compressed to 20s

**Example Patterns**:
- "1 hour → 100 HOURS survival"
- "$1 → $10 MILLION spending"
- "Level 1 → Level 100 difficulty"

**Script Structure**:
[0-2s] "Starting at Level 1"
[3-8s] "Level 10... Level 50... IT'S GETTING CRAZY"
[8-15s] "Level 99... THIS IS INSANE"
[15-20s] "FINAL LEVEL 100!!!" (PEAK)
[20-25s] "How far could YOU go? COMMENT"

**Key**: Number escalation, TENSION BUILD, rapid editing
**Tone**: HYPED, DRAMATIC, numbers on screen
            `
        }
    };

    // 3. 선택된 국가/카테고리 설정 가져오기
    const setting = countrySettings[targetCountry] || countrySettings.KR;
    const template = templates[scriptCategory]?.[targetCountry] || templates.info[targetCountry];

    // 4. 최종 프롬프트 조합
    return `
영상 제목: ${title}
댓글: ${comments || '없음'}
원본 자막:
${transcript}

${viralContext}

═══════════════════════════════════════════════════════════════════════════
🎯 타겟 설정
═══════════════════════════════════════════════════════════════════════════
- 국가: ${targetCountry} (${targetCountry === 'KR' ? '한국' : targetCountry === 'JP' ? '일본' : '미국'})
- 카테고리: ${scriptCategory}
- 연령대: ${targetAge === 'teen' ? '10대' : targetAge === '20s' ? '20대' : '30대+'}
- 편집 속도: ${setting.speed}
- 자막 밀도: ${setting.textDensity}
- 톤: ${setting.tone}
- 밈 스타일: ${setting.memeStyle}
- 숫자 표현: ${setting.numberStyle}
- 긴박감 키워드: ${setting.urgency}
- 🚨 스타일 노트 (필독): ${setting.styleNote}

═══════════════════════════════════════════════════════════════════════════
📋 템플릿 (반드시 따를 것!)
═══════════════════════════════════════════════════════════════════════════
${template}

═══════════════════════════════════════════════════════════════════════════
⚠️ 필수 준수 사항
═══════════════════════════════════════════════════════════════════════════
1. **분량**: 공백 제외 500-800자 (절대 초과 금지!)
2. **구조**: 위 템플릿의 시간대별 구조를 정확히 따를 것
3. **콜드 오픈**: 처음 2초는 설명 없이 바로 상황/결과 제시
4. **국가별 톤**: ${targetCountry} 스타일 엄수 (직역 절대 금지! 현지 유튜버처럼 자연스럽게)
   - KR: 딱딱한 문어체 절대 금지. "~했음", "~함" 종결어미 사용 금지(쇼츠 내레이션 톤 유지).
   - JP: 교과서적인 일본어 금지. 실제 사람처럼 "ね", "よ", "じゃん" 등 어미 활용.
   - US: Slang 적절히 섞어서 리듬감 있게.
5. **연령대 맞춤**: ${targetAge === 'teen' ? '10대' : targetAge === '20s' ? '20대' : '30대+'}가 공감할 예시 사용

위 템플릿을 기반으로 대본을 작성하세요.
`;
}

module.exports = { getLocalizedPrompt };
