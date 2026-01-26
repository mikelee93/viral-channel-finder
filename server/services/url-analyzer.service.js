/**
 * URL 분석 메인 서비스 (CommonJS)
 */

const { detectPlatform, isPlatformSupported } = require('./platform-detector.service');
const { analyzeYouTubeVideo } = require('./youtube-analyzer.service');
const { analyzeTikTokVideo } = require('./tiktok-analyzer.service');

async function analyzeVideoUrl(url) {
  const platform = detectPlatform(url);

  if (!isPlatformSupported(platform)) {
    throw new Error(
      `지원하지 않는 플랫폼입니다: ${platform}\n` +
      `지원 플랫폼: YouTube, TikTok, Instagram`
    );
  }

  switch (platform) {
    case 'youtube':
      return await analyzeYouTubeVideo(url);

    case 'tiktok':
      return await analyzeTikTokVideo(url);

    case 'instagram':
      throw new Error('Instagram 분석 기능은 곧 지원될 예정입니다');

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

module.exports = { analyzeVideoUrl, isValidUrl };
