# 아키텍처 원칙 (Architecture Principles)

## 핵심 철학

### 1. LM과 스크립트의 역할 분리

**LM(AI)이 할 일:**
- 패턴 분석 및 제안
- 코드 이해 및 설명
- 개선점 발견
- 대안 제시

**스크립트가 할 일:**
- 파일 필터링 (최근 커밋, 특정 경로)
- 반복 작업 (병렬 실행)
- 결과 수집 및 정리
- 지표 측정

### 2. 좁은 입력, 명확한 출력

❌ **나쁜 예:**
```
전체 레포지토리를 AI에게 던지기
"이 프로젝트를 개선해줘"
```

✅ **좋은 예:**
```
최근 3일 커밋된 5개 파일만 선택
"이 파일들의 타이딩 후보 3가지를 제안해줘"
```

### 3. 제안과 적용의 분리

```
Step 1: Analyzer (AI) → 제안 리스트 생성
Step 2: Human → 검토 및 승인
Step 3: Applier (AI or Script) → 안전하게 적용
```

## 프로젝트 구조 원칙

### 현재 구조 (개선 필요)
```
소재추출기/
├── index.html (5877줄 - 너무 큼!)
├── server.js (방대 - 분리 필요)
├── google_sheets_service.js
└── 기타 파일들...
```

### 목표 구조
```
소재추출기/
├── client/
│   ├── index.html (레이아웃만)
│   ├── scripts/
│   │   ├── viral-analysis.js
│   │   ├── script-generator.js
│   │   ├── ui-components.js
│   │   └── utils.js
│   └── styles/
│       └── main.css
├── server/
│   ├── server.js (메인 진입점만)
│   ├── routes/
│   │   ├── viral.routes.js
│   │   ├── youtube.routes.js
│   │   └── transcript.routes.js
│   ├── services/
│   │   ├── youtube.service.js
│   │   ├── tiktok.service.js
│   │   └── gemini.service.js
│   └── utils/
│       ├── validators.js
│       └── formatters.js
├── .agent/
│   ├── playbook/ (정책 문서)
│   ├── scripts/ (자동화 스크립트)
│   └── workflows/ (실행 시나리오)
└── package.json
```

## 파일 크기 가이드라인

### HTML 파일
- **최대 500줄** 권장
- 그 이상: 컴포넌트로 분리하거나 스크립트 외부화

### JavaScript 파일
- **함수: 최대 50줄**
- **파일: 최대 300줄**
- **클래스: 최대 200줄**

### 현재 위반 사항
- `index.html`: 5877줄 → **11배 초과**
- `server.js`: (확인 필요)

## 의존성 관리

### 원칙
1. **명시적 의존성**: 모든 import는 파일 상단
2. **순환 의존성 금지**: A→B→A 구조 불가
3. **레이어 분리**: 
   - Routes → Services → Utils
   - 역방향 의존 금지

## API 설계 원칙

### RESTful 패턴
```javascript
// Good
POST /api/videos/analyze
POST /api/scripts/generate
GET  /api/viral/trending

// Bad
POST /api/doAnalysis
GET  /api/getStuff
```

### 응답 구조 통일
```javascript
// Success
{
  "success": true,
  "data": { ... },
  "metadata": { ... }
}

// Error
{
  "success": false,
  "error": "에러 메시지",
  "code": "ERROR_CODE"
}
```

## 새 기능 추가 시 체크리스트

URL 분석 기능을 예로:

- [ ] **1. 서비스 레이어 먼저**
  - `services/url-analyzer.service.js` 생성
  - 플랫폼별 분석 로직 분리

- [ ] **2. 라우터 추가**
  - `routes/viral.routes.js`에 엔드포인트 추가

- [ ] **3. 클라이언트 함수 분리**
  - `client/scripts/url-analyzer.js` 생성
  - UI 로직과 API 호출 분리

- [ ] **4. 에러 처리**
  - 서비스 레벨에서 에러 정의
  - 사용자 친화적 메시지로 변환

- [ ] **5. 테스트 가능하게**
  - 순수 함수로 작성
  - 외부 의존성 주입 가능하게

## 병렬 처리 패턴

### 여러 URL 분석 시
```javascript
// Bad: 순차 처리
for (const url of urls) {
  await analyzeUrl(url);
}

// Good: 병렬 처리
const results = await Promise.allSettled(
  urls.map(url => analyzeUrl(url))
);
```

### 부분 실패 허용
```javascript
const results = await Promise.allSettled(analyses);

const succeeded = results
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);

const failed = results
  .filter(r => r.status === 'rejected')
  .map((r, i) => ({ url: urls[i], error: r.reason }));
```

## 점진적 마이그레이션 전략

### Phase 1: 새 기능은 새 구조로
- URL 분석 기능을 올바른 구조로 시작
- `/services/`, `/routes/` 폴더 생성

### Phase 2: 핫스팟 우선 리팩토링
- 자주 수정되는 부분부터
- 최근 커밋 기준으로

### Phase 3: 레거시 점진적 이동
- 큰 파일을 조금씩 분리
- 한 번에 하나씩

## 품질 지표

### 추적할 메트릭
```javascript
{
  "총 라인 수": "현재보다 증가 금지",
  "평균 파일 크기": "감소 목표",
  "평균 함수 길이": "50줄 이하",
  "Lint 오류": "0 유지",
  "중복 코드": "감소 목표"
}
```

### 매주 측정
- 월요일: 지표 스냅샷
- 금요일: 개선 확인
- 트렌드 그래프화

## 되묻기 문화

AI/사람 모두에게 적용:
- "무엇을 원하는지 모르겠으면 물어보기"
- "가정하지 말고 확인하기"
- "더 좋은 방법이 있을지 제안하기"

## 이 원칙을 지키는 이유

> 코드가 깨끗해질수록, AI가 더 정확하게 일한다.
> 그리고 사람도 더 빠르게 이해한다.
> 결국 모두가 win-win!
