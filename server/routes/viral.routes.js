/**
 * 바이럴 비디오 분석 관련 라우터
 * 
 * 역할: HTTP 요청/응답 처리, 서비스 레이어 호출
 */

import express from 'express';
import { analyzeVideoUrl, isValidUrl } from '../services/url-analyzer.service.js';

const router = express.Router();

/**
 * POST /api/analyze-viral-video
 * 바이럴 영상 URL 분석
 */
router.post('/analyze-viral-video', async (req, res) => {
  try {
    const { url } = req.body;

    // 입력 검증
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '올바른 URL 형식이 아닙니다'
      });
    }

    // 서비스 레이어 호출
    const result = await analyzeVideoUrl(url);

    // 성공 응답
    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[Viral Analysis Error]', error);

    // 에러 응답 (사용자 친화적 메시지)
    return res.status(500).json({
      success: false,
      error: error.message || '영상 분석 중 오류가 발생했습니다'
    });
  }
});

export default router;
