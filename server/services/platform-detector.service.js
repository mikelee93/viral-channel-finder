/**
 * 플랫폼 감지 서비스 (CommonJS)
 * 
 * 역할: URL에서 플랫폼(YouTube, TikTok, Instagram) 감지만 담당
 */

function detectPlatform(url) {
  if (!url || typeof url !== 'string') {
    return 'unknown';
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

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
  } catch (error) {
    return 'unknown';
  }
}

function isPlatformSupported(platform) {
  return ['youtube', 'tiktok', 'instagram'].includes(platform);
}

module.exports = { detectPlatform, isPlatformSupported };
