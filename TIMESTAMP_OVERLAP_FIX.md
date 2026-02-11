# 타임스탬프 중복 문제 해결

## 문제 상황

AI가 생성한 하이라이트 씬들이 **동일한 타임스탬프를 중복 사용**하여 총 영상 길이가 예상보다 길어지는 문제가 발생했습니다.

### 실제 예시:

```
Scene 1: 00:00 - 00:07 (7초) - Intro 나레이션
Scene 2: 00:00 - 00:07 (7초) - Body 원본 대사  ← 중복!

Scene 3: 00:07 - 00:14 (7초) - Body 나레이션
Scene 4: 00:07 - 00:12 (5초) - Body 원본 대사  ← 겹침!

Scene 6: 00:19 - 00:26 (7초) - Body 나레이션
Scene 7: 00:19 - 00:25 (6초) - Body 원본 대사  ← 겹침!
```

**결과:** 11개 씬이지만 실제로는 같은 구간을 여러 번 사용하여 총 56초가 됨

## 원인 분석

AI가 다음과 같이 잘못 이해했습니다:
- ❌ **잘못된 이해**: "나레이션 씬과 원본 대사 씬이 같은 타임스탬프를 사용해도 됨"
- ✅ **올바른 이해**: "모든 씬은 원본 영상의 서로 다른 구간을 사용해야 함"

### 왜 이런 일이 발생했나?

프롬프트에서 "나레이션과 원본 대사를 번갈아 배치"라고 했을 때, AI가:
1. 나레이션 씬: 배경 영상만 사용 (음소거)
2. 원본 대사 씬: 같은 구간의 원본 대사 포함

이렇게 **같은 구간을 두 번 사용**하는 것으로 잘못 해석했습니다.

## 해결 방법

프롬프트에 **타임스탬프 중복 금지** 규칙을 명확히 추가했습니다.

### 1. 편집 구조 가이드에 추가 (lines 784-788)

```javascript
- **🚨 CRITICAL: 씬들의 타임스탬프는 절대 겹치면 안 됨!**
  * 각 씬은 원본 영상의 **서로 다른 구간**을 사용해야 함
  * 예: Scene 1 (0-5초), Scene 2 (5-10초), Scene 3 (10-15초) ✅
  * 잘못된 예: Scene 1 (0-5초), Scene 2 (0-7초) ❌ (겹침!)
  * 나레이션 씬도 배경 영상이 필요하므로 고유한 타임스탬프 필요
```

### 2. Validation Rules 섹션에 추가 (lines 812-816)

```javascript
**🚨 TIMESTAMPS MUST NOT OVERLAP:**
- ✅ CORRECT: Scene 1 (0-5s), Scene 2 (5-10s), Scene 3 (10-15s)
- ❌ WRONG: Scene 1 (0-7s), Scene 2 (0-7s) ← Same timestamps!
- ❌ WRONG: Scene 1 (0-7s), Scene 2 (5-12s) ← Overlapping!
- Each scene must use a UNIQUE, NON-OVERLAPPING time range from the original video
```

### 3. JSON 예시 업데이트 (lines 852-882)

```javascript
{
  "order": 1,
  "start": 12.5,  // Scene 1: 12.5 - 16.5
  "end": 16.5,
  ...
},
{
  "order": 2,
  "start": 16.5,  // 🚨 Starts where Scene 1 ended! NO OVERLAP!
  "end": 21.4,    // 🚨 Different time range from Scene 1!
  ...
}
```

## 올바른 씬 구성 예시

### ✅ 정답 (겹치지 않음):

```
Scene 1: 00:00 - 00:04 (4초) - Intro 나레이션
Scene 2: 00:04 - 00:09 (5초) - Body 원본 대사
Scene 3: 00:09 - 00:14 (5초) - Body 나레이션
Scene 4: 00:14 - 00:19 (5초) - Body 원본 대사
...
총 길이: 4 + 5 + 5 + 5 + ... = 정확한 합계
```

### ❌ 오답 (중복됨):

```
Scene 1: 00:00 - 00:07 (7초) - Intro 나레이션
Scene 2: 00:00 - 00:07 (7초) - Body 원본 대사  ← 중복!
Scene 3: 00:07 - 00:14 (7초) - Body 나레이션
Scene 4: 00:07 - 00:12 (5초) - Body 원본 대사  ← 겹침!
...
총 길이: 7 + 7 + 7 + 5 + ... = 실제보다 길어짐
```

## 테스트 방법

1. **서버 재시작** (변경사항 적용)
   ```bash
   # Ctrl+C로 서버 중지 후
   npm run dev
   ```

2. **새로운 하이라이트 생성**
   - 영상 업로드 및 대본 추출
   - AI Director's Cut으로 하이라이트 생성

3. **타임스탬프 확인**
   - 브라우저 콘솔에서 `[Video Cut] Raw Director Plan` 확인
   - 각 씬의 start/end가 겹치지 않는지 확인

4. **총 길이 검증**
   ```javascript
   // 콘솔에서 실행
   const totalDuration = window.currentDirectorPlan.reduce((sum, scene) => {
     return sum + (scene.end - scene.start);
   }, 0);
   console.log('Total duration:', totalDuration, 'seconds');
   ```

## 예상 결과

### 이전 (문제):
- 11개 씬, 총 56초 (중복 포함)
- 같은 구간을 여러 번 사용

### 이후 (해결):
- 11개 씬, 총 65-70초 (중복 없음)
- 각 씬이 고유한 타임스탬프 사용
- 프롬프트 목표(65-70초)에 부합

## 추가 개선 사항

향후 더 확실한 검증을 위해 백엔드에 validation 로직 추가 가능:

```javascript
// 타임스탬프 중복 검사
function validateNoOverlap(scenes) {
  for (let i = 0; i < scenes.length - 1; i++) {
    for (let j = i + 1; j < scenes.length; j++) {
      const scene1 = scenes[i];
      const scene2 = scenes[j];
      
      // 겹침 검사
      if (scene1.start < scene2.end && scene2.start < scene1.end) {
        throw new Error(`Scene ${i+1} and ${j+1} overlap!`);
      }
    }
  }
}
```

## 파일 수정 내역

**파일:** `guidelines_routes.js`

**수정 위치:**
1. Lines 784-788: 편집 구조 가이드에 중복 금지 규칙 추가
2. Lines 812-816: Validation rules에 타임스탬프 중복 예시 추가
3. Lines 866-871: JSON 예시를 연속된 타임스탬프로 수정

**변경 사항:**
- 타임스탬프 중복 금지 명시
- 올바른 예시와 잘못된 예시 제공
- JSON 예시를 현실적인 연속 구간으로 변경
