# 나레이션 씬 제외 기능 추가

## 변경 사항

사용자 요청에 따라 **나레이션 씬은 제외하고 원본 대사(speaker) 씬만 잘라서 합치도록** 수정했습니다.

## 이유

- **나레이션**: 사용자가 원본 영상을 보면서 수동으로 붙여넣을 예정
- **원본 대사**: 자동으로 잘라서 합쳐야 함

## 수정 내용

### 파일: `youtube_guidelines.html` (lines 2681-2756)

#### 1. 나레이션 씬 필터링 추가

```javascript
// Skip narration scenes (user will add them manually)
if (scene.type && scene.type.includes('narration')) {
    narrationScenes.push({
        index: index + 1,
        stage: scene.stage || 'Unknown',
        type: scene.type,
        start: scene.start,
        end: scene.end,
        description: scene.narration_kr || scene.description || 'Narration'
    });
    return false; // Skip narration scenes
}
```

#### 2. 로깅 개선

```javascript
// 나레이션 씬 제외 로그
if (narrationScenes.length > 0) {
    console.log(`[Video Cut] 📝 Skipped ${narrationScenes.length} narration scenes (you'll add these manually):`);
    narrationScenes.forEach(scene => {
        console.log(`  Scene ${scene.index} (${scene.type}): ${scene.start}s - ${scene.end}s - "${scene.description.substring(0, 50)}..."`);
    });
}

// 최종 결과 로그
console.log(`[Video Cut] ✅ ${highlights.length} speaker clips to cut (excluding ${narrationScenes.length} narration scenes)`);
```

## 작동 방식

### 예시 Director Plan:

```
Scene 1: Intro (Hook) - narration_intro → ❌ 제외 (수동 추가)
Scene 2: Body (Story) - original_clip → ✅ 포함
Scene 3: Body (Story) - narration_bridge → ❌ 제외 (수동 추가)
Scene 4: Body (Story) - original_clip → ✅ 포함
Scene 5: Climax - narration_bridge → ❌ 제외 (수동 추가)
Scene 6: Body (Story) - original_clip → ✅ 포함
Scene 7: Outro - narration_outro → ❌ 제외 (수동 추가)
```

### 결과:

- **자동 생성 영상**: Scene 2, 4, 6만 잘라서 합침 (원본 대사만)
- **수동 작업**: Scene 1, 3, 5, 7의 나레이션을 원본 영상 보면서 직접 추가

## 콘솔 출력 예시

```
[Video Cut] Raw Director Plan: [...]
[Video Cut] Total scenes in plan: 11

[Video Cut] 📝 Skipped 4 narration scenes (you'll add these manually):
  Scene 1 (narration_intro): 0s - 4s - "분명 바른 자세를 가르쳐주는 영상인데... 왜 댓글은 엉뚱한 것만 보냐고..."
  Scene 3 (narration_bridge): 9s - 14s - "이렇게만 서도 배가 나오거나 골반이 틀어지는 걸 막을 수 있다고..."
  Scene 6 (narration_bridge): 19s - 26s - "자세를 바르게 하면 사회생활에서도 자신감을 얻을 수 있다고..."
  Scene 10 (narration_outro): 45s - 50s - "여러분은 이 영상의 진짜 하이라이트가 뭐라고 생각하시나요?..."

[Video Cut] ✅ 7 speaker clips to cut (excluding 4 narration scenes)
[Video Cut] Cutting speaker clips: [...]
```

## 필터링 로직

```javascript
const highlights = window.currentDirectorPlan
    .filter((scene, index) => {
        // 1. 나레이션 씬 제외
        if (scene.type && scene.type.includes('narration')) {
            narrationScenes.push({...});
            return false; // ❌ 제외
        }

        // 2. 타임스탬프 유효성 검사
        const s = parseFloat(scene.start);
        const e = parseFloat(scene.end);
        const isValid = !isNaN(s) && !isNaN(e) && e > s;

        if (!isValid) {
            invalidScenes.push({...});
        }

        return isValid; // ✅ 유효한 원본 대사 씬만 포함
    })
    .map(scene => ({
        start: parseFloat(scene.start),
        end: parseFloat(scene.end)
    }));
```

## 사용 방법

1. **하이라이트 생성**: AI Director's Cut으로 하이라이트 생성
2. **영상 자르기**: "🎬 하이라이트 영상 자동 생성" 버튼 클릭
3. **결과 확인**: 
   - 콘솔에서 몇 개의 나레이션 씬이 제외되었는지 확인
   - 원본 대사 씬만 합쳐진 영상 다운로드
4. **수동 작업**: 
   - 다운로드된 영상을 편집 프로그램에서 열기
   - 콘솔에 표시된 나레이션 씬의 타임스탬프 참고
   - 원본 영상에서 해당 구간을 찾아 나레이션 추가

## 장점

✅ **시간 절약**: 원본 대사 씬을 자동으로 잘라서 합침  
✅ **유연성**: 나레이션은 원본 영상을 보면서 정확하게 배치 가능  
✅ **품질 향상**: 나레이션 타이밍을 수동으로 조절하여 더 자연스러운 편집 가능  
✅ **명확한 로그**: 어떤 씬이 제외되었는지 콘솔에서 확인 가능

## 주의사항

- 나레이션 씬의 타임스탬프는 콘솔 로그에서 확인할 수 있습니다
- 에러 메시지는 아직 업데이트되지 않았지만, 기능은 정상 작동합니다
- 브라우저를 새로고침하면 변경사항이 적용됩니다 (서버 재시작 불필요)
