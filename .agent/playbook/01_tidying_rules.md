# 타이딩 규칙 (Tidying Rules)

## 목표
코드를 AI-friendly하고 유지보수 가능하게 만들기 위한 안전한 소형 리팩토링 규칙

## 핵심 원칙

### 1. 한 번에 하나만 (One Thing at a Time)
- 각 타이딩은 단일 목적만 가짐
- 여러 개선을 동시에 하지 않음
- 커밋 메시지에 명확한 의도 기록

### 2. 안전 우선 (Safety First)
- 로직 변경 없는 개선만
- lint/test 통과 필수
- 되돌리기 쉬운 변경만

### 3. 점진적 개선 (Incremental Improvement)
- 완벽보다는 꾸준함
- 매일 조금씩
- 작은 승리를 축적

## 타이딩 카테고리

### Category A: 구조 정리 (Safe - 항상 가능)

#### A1. 공백/들여쓰기 정리
```javascript
// Before
function foo(){
const x=1;
const y=2;
return x+y;
}

// After
function foo() {
  const x = 1;
  const y = 2;
  
  return x + y;
}
```

#### A2. 의미 단위로 구분
```javascript
// Before
async function analyzeVideo() {
  const url = getUrl();
  const platform = detectPlatform(url);
  const data = await fetch(url);
  const transcript = extractTranscript(data);
  return transcript;
}

// After
async function analyzeVideo() {
  // 1. 입력 파싱
  const url = getUrl();
  const platform = detectPlatform(url);
  
  // 2. 데이터 가져오기
  const data = await fetch(url);
  
  // 3. 전사 추출
  const transcript = extractTranscript(data);
  return transcript;
}
```

#### A3. Import 정리
```javascript
// Before
import { b } from './b';
import { a } from './a';
import React from 'react';

// After
// External
import React from 'react';

// Internal
import { a } from './a';
import { b } from './b';
```

### Category B: 명명 개선 (Medium - 팀 리뷰 필요)

#### B1. 의미 있는 이름
```javascript
// Before
const d = new Date();
const x = data.items;

// After  
const currentDate = new Date();
const videoItems = data.items;
```

#### B2. 일관된 네이밍 컨벤션
```javascript
// Before
const get_user = () => {};
const fetchVideo = () => {};
const DownloadData = () => {};

// After (camelCase로 통일)
const getUser = () => {};
const fetchVideo = () => {};
const downloadData = () => {};
```

### Category C: 함수 분리 (High - 신중하게)

#### C1. 한 함수는 한 가지 일만
```javascript
// Before
async function processVideo(url) {
  const platform = url.includes('tiktok') ? 'tiktok' : 'youtube';
  const response = await fetch(url);
  const data = await response.json();
  const transcript = data.text.split(' ').join(' ');
  const cleaned = transcript.replace(/\n/g, ' ');
  return { platform, cleaned };
}

// After
async function processVideo(url) {
  const platform = detectPlatform(url);
  const data = await fetchVideoData(url);
  const transcript = extractTranscript(data);
  const cleaned = cleanTranscript(transcript);
  
  return { platform, cleaned };
}

function detectPlatform(url) {
  if (url.includes('tiktok')) return 'tiktok';
  if (url.includes('youtube')) return 'youtube';
  if (url.includes('instagram')) return 'instagram';
  return 'unknown';
}

function cleanTranscript(text) {
  return text.replace(/\n/g, ' ').trim();
}
```

## 이 프로젝트에 특화된 규칙

### HTML 파일 (index.html)
- [ ] 5000줄 이상 파일은 기능별로 분리 검토
- [ ] 인라인 스크립트를 별도 파일로 분리
- [ ] 반복되는 HTML 패턴은 함수로 추출

### 서버 파일 (server.js)
- [ ] API 엔드포인트는 별도 라우터 파일로 분리
- [ ] 유틸리티 함수는 `/utils/` 폴더로
- [ ] 서비스 로직은 `/services/` 폴더로

### 공통
- [ ] 매직 넘버/문자열은 상수로 정의
- [ ] 중복 코드는 공통 함수로 추출
- [ ] 긴 함수(50줄 이상)는 분리 검토

## 금지 사항 (하지 말 것)

❌ **로직 변경하는 리팩토링**
- 조건문 변경
- 계산 로직 수정
- API 응답 구조 변경

❌ **테스트되지 않은 큰 변경**
- 한 번에 여러 파일 대량 수정
- 의존성 변경
- 외부 API 호출 방식 변경

❌ **팀 합의 없는 아키텍처 변경**
- 폴더 구조 전면 개편
- 프레임워크 도입
- 빌드 시스템 변경

## 타이딩 체크리스트

새로운 타이딩을 할 때 확인:

- [ ] 변경 전/후 기능이 동일한가?
- [ ] Lint 오류가 증가하지 않는가?
- [ ] 파일 크기가 너무 커지지 않는가?
- [ ] 다른 개발자가 이해하기 쉬운가?
- [ ] 되돌리기 쉬운가?

## 우선순위

### 높음 (지금 당장)
1. 최근 커밋한 파일
2. Lint 오류 많은 파일
3. 자주 수정되는 파일

### 중간 (이번 주)
1. 핵심 기능 파일
2. 공통 유틸리티

### 낮음 (나중에)
1. 오래된 레거시 코드
2. 사용 빈도 낮은 파일
