#!/usr/bin/env node

/**
 * 최근 커밋 분석 스크립트
 * 
 * 역할: LM에게 전체 레포를 던지지 않고, 최근 수정된 파일만 필터링
 * 이유: 토큰 절약 + 맥락 명확 + 빠른 분석
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CONFIG = {
    daysToAnalyze: 7,           // 최근 7일
    excludePatterns: [
        'node_modules/',
        'package-lock.json',
        '.git/',
        'dist/',
        'build/'
    ],
    maxFilesPerRun: 5,          // 한 번에 최대 5개 파일만
    targetExtensions: ['.js', '.html', '.css']
};

/**
 * 최근 N일간 수정된 파일 목록 가져오기
 */
function getRecentlyModifiedFiles(days = 7) {
    try {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        const since = sinceDate.toISOString().split('T')[0];

        // git log로 최근 커밋된 파일들 가져오기
        const command = `git log --since="${since}" --name-only --pretty=format: | sort -u`;
        const output = execSync(command, { encoding: 'utf-8' });

        const files = output
            .split('\n')
            .filter(line => line.trim())
            .filter(file => {
                // 제외 패턴 필터링
                return !CONFIG.excludePatterns.some(pattern => file.includes(pattern));
            })
            .filter(file => {
                // 확장자 필터링
                const ext = path.extname(file);
                return CONFIG.targetExtensions.includes(ext);
            })
            .filter(file => fs.existsSync(file)); // 실제 존재하는 파일만

        return files;
    } catch (error) {
        console.error('Git log 실행 오류:', error.message);
        return [];
    }
}

/**
 * 파일별 통계 수집
 */
function getFileStats(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        return {
            path: filePath,
            totalLines: lines.length,
            nonEmptyLines: lines.filter(l => l.trim()).length,
            functions: (content.match(/function\s+\w+/g) || []).length,
            asyncFunctions: (content.match(/async\s+function/g) || []).length,
            sizeKB: Math.round(fs.statSync(filePath).size / 1024)
        };
    } catch (error) {
        return null;
    }
}

/**
 * 타이딩 우선순위 계산
 */
function calculatePriority(stats) {
    let score = 0;

    // 큰 파일일수록 높은 우선순위
    if (stats.totalLines > 1000) score += 50;
    else if (stats.totalLines > 500) score += 30;
    else if (stats.totalLines > 200) score += 10;

    // 함수가 많으면 분리 필요 가능성
    if (stats.functions > 20) score += 20;

    // async 함수 많으면 에러 처리 검토 필요
    if (stats.asyncFunctions > 10) score += 15;

    return score;
}

/**
 * 메인 실행
 */
function main() {
    console.log('🔍 최근 커밋 분석 시작...\n');
    console.log(`📅 분석 기간: 최근 ${CONFIG.daysToAnalyze}일`);
    console.log(`📁 최대 파일 수: ${CONFIG.maxFilesPerRun}개\n`);

    // 1. 최근 수정된 파일 목록
    const recentFiles = getRecentlyModifiedFiles(CONFIG.daysToAnalyze);

    if (recentFiles.length === 0) {
        console.log('❌ 최근 수정된 파일이 없습니다.');
        return;
    }

    console.log(`✅ 최근 수정된 파일: ${recentFiles.length}개 발견\n`);

    // 2. 파일별 통계 수집
    const fileStats = recentFiles
        .map(getFileStats)
        .filter(Boolean)
        .map(stats => ({
            ...stats,
            priority: calculatePriority(stats)
        }))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, CONFIG.maxFilesPerRun);

    // 3. 결과 출력
    console.log('📊 타이딩 추천 파일 (우선순위 순):\n');

    fileStats.forEach((stats, index) => {
        console.log(`${index + 1}. ${stats.path}`);
        console.log(`   📏 라인 수: ${stats.totalLines} (실제 코드: ${stats.nonEmptyLines})`);
        console.log(`   ⚙️  함수 수: ${stats.functions} (async: ${stats.asyncFunctions})`);
        console.log(`   💾 크기: ${stats.sizeKB}KB`);
        console.log(`   ⭐ 우선순위 점수: ${stats.priority}`);
        console.log('');
    });

    // 4. AI 분석용 JSON 출력
    const outputPath = '.agent/temp/recent-analysis.json';
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
        outputPath,
        JSON.stringify({ files: fileStats, generatedAt: new Date().toISOString() }, null, 2)
    );

    console.log(`\n💾 분석 결과 저장: ${outputPath}`);
    console.log('\n다음 단계:');
    console.log('1. 이 파일들을 AI에게 보내서 타이딩 제안 받기');
    console.log('2. 제안 중 안전한 것들만 선택');
    console.log('3. 한 번에 하나씩 적용하고 커밋');
}

// 스크립트 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { getRecentlyModifiedFiles, getFileStats, calculatePriority };
