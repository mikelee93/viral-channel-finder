# URL 분석 기능 구현 가이드

## 목표
바이럴 쇼츠 대본 생성기에 URL 분석 기능을 추가하되, **아키텍처 원칙을 준수**하면서 구현

## 왜 이 기능부터?
1. 사용자가 바로 필요로 하는 기능
2. 새 기능이라 레거시에 얽매이지 않음
3. **올바른 구조를 학습하는 최고의 기회**

## 구현 전략: "Clean Architecture로 시작"

### Phase 1: 서비스 레이어 (비즈니스 로직)

#### 파일 구조
```
server/
└── services/
    ├── url-analyzer.service.js (메인 오케스트레이터)
    ├── youtube-analyzer.service.js
    ├── tiktok-analyzer.service.js
    └── platform-detector.service.js
```

#### 역할 분리
```javascript
// platform-detector.service.js
// 역할: URL에서 플랫폼만 감지 (단일 책임)
export function detectPlatform(url) {
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('instagram.com')) return 'instagram';
  return 'unknown';
}

// youtube-analyzer.service.js  
// 역할: YouTube 영상만 분석
export async function analyzeYouTubeVideo(url) {
  const videoId = extractVideoId(url);
  const transcript = await fetchTranscript(videoId);
  const metadata = await fetchMetadata(videoId);
  const comments = await fetchComments(videoId);
  
  return { transcript, metadata, comments, platform: 'youtube' };
}

// url-analyzer.service.js
// 역할: 플랫폼별 분석기 조율
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

### Phase 2: 라우터 레이어 (HTTP 처리)

```javascript
// routes/viral.routes.js
import express from 'express';
import { analyzeVideoUrl } from '../services/url-analyzer.service.js';

const router = express.Router();

router.post('/analyze-viral-video', async (req, res) => {
  try {
    const { url } = req.body;
    
    // 입력 검증
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    // 비즈니스 로직 호출 (서비스 레이어)
    const result = await analyzeVideoUrl(url);
    
    // 성공 응답
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Viral video analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
```

### Phase 3: 클라이언트 레이어 (UI)

```javascript
// client/scripts/url-analyzer.js
class UrlAnalyzer {
  async analyze(url, platform) {
    const response = await fetch('/api/analyze-viral-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, platform })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    return data.data;
  }
}

// HTML에서 사용
async function analyzeVideo() {
  const urlInput = document.getElementById('viralVideoUrl');
  const url = urlInput.value.trim();
  
  if (!url) {
    return alert('URL을 입력해주세요.');
  }
  
  try {
    showLoading();
    
    const analyzer = new UrlAnalyzer();
    const result = await analyzer.analyze(url, scriptGenPlatform);
    
    displayResult(result);
    
  } catch (error) {
    showError(error.message);
  } finally {
    hideLoading();
  }
}
```

## LM vs 스크립트 역할 분리

### 스크립트가 할 일 (확정적)
```javascript
// utils/validators.js
export function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function extractVideoId(url) {
  // YouTube
  const ytMatch = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
  if (ytMatch) return ytMatch[1];
  
  // TikTok
  const ttMatch = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
  if (ttMatch) return ttMatch[1];
  
  return null;
}
```

### LM(AI)이 할 일 (분석/제안)
```javascript
// Gemini에게 전사된 텍스트를 주고
// "이 대본을 바이럴 쇼츠 형식으로 재작성해줘"
const prompt = `
원본 전사: ${transcript}
댓글 반응: ${comments}

위 내용을 바이럴 쇼츠 대본으로:
- Hook (0-3초)
- 전개 (3-9초)
- 반전 (9-16초)
- 강조 (16-23초)
- CTA (23-30초)

각 섹션별 대본과 화면 연출을 제안해줘.
`;
```

## 에러 처리 계층화

```javascript
// 서비스 레이어: 구체적 에러
class YoutubeTranscriptNotFoundError extends Error {
  constructor(videoId) {
    super(`Transcript not found for video: ${videoId}`);
    this.name = 'YoutubeTranscriptNotFoundError';
    this.videoId = videoId;
  }
}

// 라우터 레이어: HTTP 상태 매핑
function mapErrorToHttpResponse(error) {
  if (error instanceof YoutubeTranscriptNotFoundError) {
    return {
      status: 404,
      message: '영상 자막을 찾을 수 없습니다. 자막이 없는 영상일 수 있습니다.'
    };
  }
  
  return {
    status: 500,
    message: '영상 분석 중 오류가 발생했습니다.'
  };
}
```

## 병렬 처리 전략

### TikTok 분석 시나리오
```javascript
// 순차적으로 하면 느림
const metadata = await fetchTikTokMetadata(url);  // 2초
const transcript = await transcribeAudio(url);    // 5초
const comments = await fetchComments(url);        // 1초
// 총 8초

// 병렬로 하면 빠름
const [metadata, transcript, comments] = await Promise.allSettled([
  fetchTikTokMetadata(url),
  transcribeAudio(url),
  fetchComments(url)
]);
// 총 5초 (가장 긴 작업 기준)
```

### 부분 실패 허용
```javascript
const results = await Promise.allSettled([
  fetchTranscript(videoId),
  fetchComments(videoId),
  fetchMetadata(videoId)
]);

// 최소 하나라도 성공하면 진행
const hasData = results.some(r => r.status === 'fulfilled');

if (!hasData) {
  throw new Error('영상 정보를 전혀 가져올 수 없습니다');
}

// 부분 성공 처리
return {
  transcript: results[0].status === 'fulfilled' ? results[0].value : '자막 없음',
  comments: results[1].status === 'fulfilled' ? results[1].value : [],
  metadata: results[2].status === 'fulfilled' ? results[2].value : {}
};
```

## 테스트 가능하게 만들기

```javascript
// Bad: 테스트 불가능
async function analyzeTikTok(url) {
  const apifyClient = new ApifyClient({ token: process.env.APIFY_TOKEN });
  // ... 하드코딩된 의존성
}

// Good: 의존성 주입
async function analyzeTikTok(url, { apifyClient = defaultApifyClient } = {}) {
  // 테스트 시 mock 주입 가능
}
```

## 점진적 구현 순서

### Week 1: YouTube만 (기존 기능 활용)
1. ✅ `youtube-analyzer.service.js` 생성
2. ✅ 기존 youtube-transcript 로직 이동
3. ✅ 라우터 연결
4. ✅ 클라이언트 테스트

### Week 2: TikTok 추가
1. `tiktok-analyzer.service.js` 생성
2. Apify 연동
3. 병렬 처리 적용
4. 에러 핸들링 강화

### Week 3: Instagram (선택)
1. Instagram 분석기 추가
2. 공통 인터페이스 정리

## 품질 체크리스트

구현 완료 후 확인:

- [ ] 각 함수가 50줄 이하인가?
- [ ] 파일이 300줄 이하인가?
- [ ] 의존성이 명확한가?
- [ ] 에러 메시지가 사용자 친화적인가?
- [ ] Lint 오류가 없는가?
- [ ] 중복 코드가 없는가?
- [ ] 다른 사람이 읽고 이해할 수 있는가?

## 이 구현에서 배우는 것

1. **서비스 레이어 패턴**: 비즈니스 로직을 HTTP에서 분리
2. **단일 책임 원칙**: 각 파일/함수가 하나의 일만
3. **의존성 주입**: 테스트 가능하게
4. **에러 계층화**: 구체적 → 사용자 친화적
5. **병렬 처리**: 성능 최적화
6. **점진적 개선**: 한 번에 완벽하려 하지 않기

## 다음 단계

이 패턴을 익힌 후:
1. 기존 거대한 `index.html`의 스크립트 분리
2. `server.js`의 엔드포인트들을 라우터로 분리
3. 공통 유틸리티 추출
4. 지표 대시보드 구축

---

**핵심 메시지:**
> 완벽한 리팩토링을 기다리지 마세요.
> 새 기능부터 올바르게 시작하고,
> 레거시는 만질 때마다 조금씩 개선하세요.
