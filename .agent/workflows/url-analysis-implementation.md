# URL 분석 기능 개발 워크플로우

> 이 워크플로우는 "올바른 아키텍처"를 학습하면서 실제 기능을 개발하는 가이드입니다.

## 전체 흐름

```
1. 설계 → 2. 서비스 구현 → 3. 라우터 연결 → 4. 클라이언트 수정 → 5. 테스트
```

---

## Step 1: 설계 (AI 활용)

### 1-1. 요구사항 정리

**체크리스트:**
- [ ] 어떤 플랫폼을 지원하나? (YouTube, TikTok, Instagram)
- [ ] 각 플랫폼에서 무엇을 추출하나? (자막, 댓글, 메타데이터)
- [ ] 실패 시 어떻게 처리하나? (부분 성공 허용?)
- [ ] 성능 요구사항은? (병렬 처리 필요?)

### 1-2. AI에게 설계 요청

**프롬프트:**
```
당신은 Clean Architecture 전문가입니다.

**기능:** URL 입력받아 영상 분석
- YouTube: youtube-transcript로 자막, YouTube API로 댓글/메타데이터
- TikTok: Apify로 메타데이터, Whisper로 자막
- Instagram: Apify로 메타데이터

**요청:**
서비스 레이어 파일 구조를 설계하고, 각 파일의 책임을 설명해주세요.

**제약:**
- 한 파일 300줄 이하
- 한 함수 50줄 이하
- 테스트 가능하게 (의존성 주입)
```

**예상 출력:**
```
services/
├── url-analyzer.service.js         # 메인 오케스트레이터
├── platform-detector.service.js    # 플랫폼 감지만
├── youtube-analyzer.service.js     # YouTube 전용
└── tiktok-analyzer.service.js      # TikTok 전용
```

---

## Step 2: 서비스 구현 (점진적)

### 2-1. YouTube부터 (가장 쉬운 것부터)

**파일 생성:** `server/services/youtube-analyzer.service.js`

```javascript
import { YoutubeTranscript } from 'youtube-transcript';

/**
 * YouTube 영상 분석
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} 분석 결과
 */
export async function analyzeYouTubeVideo(url) {
  const videoId = extractYouTubeId(url);
  
  // 병렬 처리
  const [transcript, metadata, comments] = await Promise.allSettled([
    fetchTranscript(videoId),
    fetchMetadata(videoId),
    fetchComments(videoId)
  ]);
  
  return {
    platform: 'youtube',
    videoId,
    transcript: transcript.status === 'fulfilled' ? transcript.value : null,
    metadata: metadata.status === 'fulfilled' ? metadata.value : {},
    comments: comments.status === 'fulfilled' ? comments.value : [],
    errors: collectErrors([transcript, metadata, comments])
  };
}

function extractYouTubeId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
  if (!match) throw new Error('Invalid YouTube URL');
  return match[1];
}

async function fetchTranscript(videoId) {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  return transcript.map(t => t.text).join(' ');
}

// ... 나머지 헬퍼 함수들
```

**체크리스트:**
- [ ] 함수가 50줄 이하인가?
- [ ] 에러 처리가 명확한가?
- [ ] 테스트하기 쉬운가?
- [ ] JSDoc 주석이 있는가?

### 2-2. 플랫폼 감지기

**파일 생성:** `server/services/platform-detector.service.js`

```javascript
/**
 * URL에서 플랫폼 감지
 * @param {string} url 
 * @returns {'youtube'|'tiktok'|'instagram'|'unknown'}
 */
export function detectPlatform(url) {
  if (!url) return 'unknown';
  
  const hostname = new URL(url).hostname.toLowerCase();
  
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    return 'youtube';
  }
  
  if (hostname.includes('tiktok.com')) {
    return 'tiktok';
  }
  
  if (hostname.includes('instagram.com')) {
    return 'instagram';
  }
  
  return 'unknown';
}
```

### 2-3. 메인 오케스트레이터

**파일 생성:** `server/services/url-analyzer.service.js`

```javascript
import { detectPlatform } from './platform-detector.service.js';
import { analyzeYouTubeVideo } from './youtube-analyzer.service.js';
import { analyzeTikTokVideo } from './tiktok-analyzer.service.js';

export async function analyzeVideoUrl(url) {
  const platform = detectPlatform(url);
  
  switch (platform) {
    case 'youtube':
      return await analyzeYouTubeVideo(url);
      
    case 'tiktok':
      return await analyzeTikTokVideo(url);
      
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
```

---

## Step 3: 라우터 연결

### 3-1. 라우터 파일 생성

**파일 생성:** `server/routes/viral.routes.js`

```javascript
import express from 'express';
import { analyzeVideoUrl } from '../services/url-analyzer.service.js';

const router = express.Router();

router.post('/analyze-viral-video', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    const result = await analyzeVideoUrl(url);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('[Viral Analysis Error]', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
```

### 3-2. 메인 서버에 라우터 등록

**파일 수정:** `server.js`

```javascript
// 상단에 추가
import viralRoutes from './routes/viral.routes.js';

// 미들웨어 섹션에 추가
app.use('/api', viralRoutes);
```

---

## Step 4: 클라이언트 수정

### 4-1. 기존 함수 수정

**파일 수정:** `index.html` (5654-5740줄의 `analyzeVideo` 함수)

**Before:**
```javascript
// TODO: Implement URL transcription logic if needed
throw new Error('URL 분석 기능은 현재 준비 중입니다.');
```

**After:**
```javascript
// URL 분석 구현
const response = await fetch('http://localhost:4000/api/analyze-viral-video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: hasUrl })
});

const data = await response.json();

if (!data.success) {
  throw new Error(data.error);
}

transcript = data.data.transcript || '자막을 가져올 수 없습니다';
metadata = data.data.metadata || {};
```

---

## Step 5: 테스트

### 5-1. 수동 테스트 체크리스트

**YouTube URL:**
- [ ] https://youtube.com/watch?v=xxx 형식
- [ ] https://youtu.be/xxx 형식
- [ ] Shorts URL
- [ ] 자막 없는 영상 (에러 처리 확인)
- [ ] 비공개 영상 (에러 메시지 확인)

**TikTok URL:**
- [ ] 일반 TikTok URL
- [ ] 영상 로드 확인
- [ ] 메타데이터 표시 확인

**에러 케이스:**
- [ ] 빈 URL
- [ ] 잘못된 URL
- [ ] 지원하지 않는 플랫폼

### 5-2. 서버 로그 확인

```bash
# 서버 실행
npm run dev

# 다른 터미널에서 테스트 요청
curl -X POST http://localhost:4000/api/analyze-viral-video \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtube.com/watch?v=dQw4w9WgXcQ"}'
```

---

## Step 6: 개선 (옵션)

### 6-1. 캐싱 추가 (자주 조회되는 영상)

```javascript
// Simple in-memory cache
const cache = new Map();

export async function analyzeVideoUrl(url) {
  const cacheKey = url;
  
  if (cache.has(cacheKey)) {
    console.log('Cache hit:', url);
    return cache.get(cacheKey);
  }
  
  const result = await actualAnalysis(url);
  cache.set(cacheKey, result);
  
  return result;
}
```

### 6-2. 진행 상황 표시 (WebSocket or SSE)

```javascript
// 클라이언트에서 실시간 상태 업데이트
// "자막 추출 중..." → "댓글 가져오는 중..." → "완료!"
```

---

## 체크포인트

각 단계마다 확인:

### ✅ 코드 품질
- [ ] Lint 오류 없음
- [ ] 함수 길이 적절
- [ ] 주석 충분
- [ ] 네이밍 명확

### ✅ 아키텍처
- [ ] 서비스 레이어 분리됨
- [ ] 단일 책임 원칙 준수
- [ ] 의존성 명확
- [ ] 에러 처리 일관됨

### ✅ 사용성
- [ ] 에러 메시지 사용자 친화적
- [ ] 로딩 상태 표시
- [ ] 성공/실패 명확히 구분

---

## 다음 단계

이 워크플로우가 익숙해지면:

1. **TikTok 분석 추가** (같은 패턴 반복)
2. **Instagram 분석 추가** (선택)
3. **기존 거대 파일 분리** (학습한 패턴 적용)
4. **지표 대시보드 구축** (개선 효과 측정)

---

**핵심 배움:**
> 한 번에 완벽하게 하려 하지 마세요.
> YouTube만 먼저 완벽하게 만들고,
> 그 패턴을 TikTok에 복사하세요.
> 반복이 학습입니다! 🚀
