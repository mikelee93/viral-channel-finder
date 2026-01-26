/**
 * YouTube 영상 분석 서비스 (CommonJS)
 */

const { YoutubeTranscript } = require('youtube-transcript');

async function analyzeYouTubeVideo(url) {
  const videoId = extractYouTubeId(url);

  // 병렬 처리
  const [transcriptResult, metadataResult] = await Promise.allSettled([
    fetchTranscript(videoId),
    fetchMetadata(videoId)
  ]);

  return {
    platform: 'youtube',
    videoId,
    videoUrl: url,
    transcript: transcriptResult.status === 'fulfilled' ? transcriptResult.value : null,
    metadata: metadataResult.status === 'fulfilled' ? metadataResult.value : {},
    comments: [], // 댓글은 기존 API 사용
    errors: collectErrors({ transcriptResult, metadataResult })
  };
}

function extractYouTubeId(url) {
  let match = url.match(/[?&]v=([^&]+)/);
  if (match) return match[1];

  match = url.match(/youtu\.be\/([^?]+)/);
  if (match) return match[1];

  match = url.match(/\/shorts\/([^?]+)/);
  if (match) return match[1];

  throw new Error('Invalid YouTube URL format');
}

async function fetchTranscript(videoId) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map(segment => segment.text).join(' ');
  } catch (error) {
    console.error(`[YouTube Transcript] Failed for ${videoId}:`, error.message);
    throw new Error('자막을 가져올 수 없습니다. 자막이 없는 영상일 수 있습니다.');
  }
}

async function fetchMetadata(videoId) {
  return {
    id: videoId,
    title: '',
    author: '',
    views: 0,
    likes: 0
  };
}

function collectErrors(results) {
  const errors = [];

  if (results.transcriptResult?.status === 'rejected') {
    errors.push(`Transcript: ${results.transcriptResult.reason.message}`);
  }

  if (results.metadataResult?.status === 'rejected') {
    errors.push(`Metadata: ${results.metadataResult.reason.message}`);
  }

  return errors;
}

module.exports = { analyzeYouTubeVideo, extractYouTubeId };
