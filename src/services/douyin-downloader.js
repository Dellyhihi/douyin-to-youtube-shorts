const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { DOWNLOADS_DIR, extractDouyinId, sleep } = require('../utils/helpers');

// Common headers to mimic browser
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Referer': 'https://www.douyin.com/',
};

/**
 * Resolve a short Douyin share URL to full URL
 */
async function resolveShareUrl(shareUrl) {
  try {
    const response = await axios.get(shareUrl, {
      headers: HEADERS,
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400,
    });
    return response.headers.location || shareUrl;
  } catch (error) {
    if (error.response && error.response.headers.location) {
      return error.response.headers.location;
    }
    // Try to extract from the share text
    const urlMatch = shareUrl.match(/https?:\/\/[^\s]+/);
    return urlMatch ? urlMatch[0] : shareUrl;
  }
}

/**
 * Extract video info from Douyin URL using web page parsing
 */
async function getVideoInfo(url) {
  try {
    // First resolve short URLs
    let fullUrl = url;
    if (url.includes('v.douyin.com') || url.includes('vm.douyin.com')) {
      fullUrl = await resolveShareUrl(url);
      logger.info(`Resolved URL: ${fullUrl}`);
    }

    // Extract video ID
    const videoId = extractDouyinId(fullUrl);
    if (!videoId) {
      throw new Error('Không thể trích xuất Video ID từ URL');
    }

    logger.info(`Video ID: ${videoId}`);

    // Try to get video info via the web API
    const cookie = process.env.DOUYIN_COOKIE || '';
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=1128&version_name=23.5.0`;

    const response = await axios.get(apiUrl, {
      headers: {
        ...HEADERS,
        'Cookie': cookie,
      },
      timeout: 15000,
    });

    if (response.data && response.data.aweme_detail) {
      const detail = response.data.aweme_detail;
      const videoUrls = detail.video?.play_addr?.url_list || [];
      const noWmUrl = videoUrls.length > 0
        ? videoUrls[0].replace('playwm', 'play')
        : null;

      return {
        id: videoId,
        caption: detail.desc || '',
        author: detail.author?.nickname || 'Unknown',
        videoUrl: noWmUrl,
        coverUrl: detail.video?.cover?.url_list?.[0] || null,
        duration: (detail.video?.duration || 0) / 1000,
        width: detail.video?.width || 0,
        height: detail.video?.height || 0,
      };
    }

    // Fallback: Try to parse from page HTML
    return await getVideoInfoFromPage(fullUrl, videoId, cookie);

  } catch (error) {
    logger.error(`Error getting video info: ${error.message}`);
    throw error;
  }
}

/**
 * Fallback: parse video info from the page HTML/script data
 */
async function getVideoInfoFromPage(url, videoId, cookie) {
  try {
    const pageUrl = `https://www.douyin.com/video/${videoId}`;
    const response = await axios.get(pageUrl, {
      headers: {
        ...HEADERS,
        'Cookie': cookie,
      },
      timeout: 15000,
    });

    const html = response.data;

    // Try to extract render data from SSR
    const renderMatch = html.match(/self\.__pace_f\.push\(\[1,"(.*?)"\]\)/s)
      || html.match(/<script id="RENDER_DATA" type="application\/json">(.*?)<\/script>/);

    if (renderMatch) {
      try {
        let jsonStr = renderMatch[1];
        // Unescape if needed
        if (jsonStr.includes('\\u')) {
          jsonStr = JSON.parse(`"${jsonStr}"`);
        }
        jsonStr = decodeURIComponent(jsonStr);
        const data = JSON.parse(jsonStr);

        // Navigate the render data to find video info
        const awemeDetail = findNestedKey(data, 'awemeDetail') || findNestedKey(data, 'aweme_detail');
        if (awemeDetail) {
          const videoUrls = awemeDetail.video?.play_addr?.url_list || [];
          return {
            id: videoId,
            caption: awemeDetail.desc || '',
            author: awemeDetail.author?.nickname || 'Unknown',
            videoUrl: videoUrls.length > 0 ? videoUrls[0].replace('playwm', 'play') : null,
            coverUrl: awemeDetail.video?.cover?.url_list?.[0] || null,
            duration: (awemeDetail.video?.duration || 0) / 1000,
            width: awemeDetail.video?.width || 0,
            height: awemeDetail.video?.height || 0,
          };
        }
      } catch (e) {
        logger.warn('Failed to parse render data:', e.message);
      }
    }

    // Last resort: return basic info with video ID
    return {
      id: videoId,
      caption: '',
      author: 'Unknown',
      videoUrl: null,
      coverUrl: null,
      duration: 0,
      width: 0,
      height: 0,
    };

  } catch (error) {
    logger.error(`Page parse error: ${error.message}`);
    return {
      id: videoId,
      caption: '',
      author: 'Unknown',
      videoUrl: null,
      coverUrl: null,
      duration: 0,
      width: 0,
      height: 0,
    };
  }
}

/**
 * Recursively find a key in nested object
 */
function findNestedKey(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[key] !== undefined) return obj[key];
  for (const k of Object.keys(obj)) {
    const result = findNestedKey(obj[k], key);
    if (result) return result;
  }
  return null;
}

/**
 * Download the video file to local disk
 */
async function downloadVideo(videoUrl, videoId) {
  if (!videoUrl) {
    throw new Error('Không có URL video để tải');
  }

  const filename = `${videoId}_${uuidv4().slice(0, 8)}.mp4`;
  const filepath = path.join(DOWNLOADS_DIR, filename);

  logger.download(`Downloading video ${videoId}...`);

  const response = await axios.get(videoUrl, {
    headers: {
      ...HEADERS,
      'Range': 'bytes=0-',
    },
    responseType: 'stream',
    timeout: 60000,
  });

  const writer = fs.createWriteStream(filepath);

  return new Promise((resolve, reject) => {
    let downloaded = 0;
    const totalSize = parseInt(response.headers['content-length'] || '0', 10);

    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      if (totalSize > 0) {
        const percent = ((downloaded / totalSize) * 100).toFixed(1);
        process.stdout.write(`\r  Progress: ${percent}% (${(downloaded / 1024 / 1024).toFixed(2)} MB)`);
      }
    });

    response.data.pipe(writer);

    writer.on('finish', () => {
      console.log('');
      const stats = fs.statSync(filepath);
      logger.success(`Downloaded: ${filepath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      resolve({
        path: filepath,
        filename,
        size: stats.size,
      });
    });

    writer.on('error', (err) => {
      fs.unlinkSync(filepath);
      reject(err);
    });
  });
}

/**
 * Full download pipeline: resolve URL → get info → download
 */
async function processDouyinUrl(url) {
  logger.info(`Processing Douyin URL: ${url}`);

  // Get video info
  const info = await getVideoInfo(url);
  logger.info(`Video: "${info.caption}" by ${info.author}`);

  // Download video
  let downloadResult = null;
  if (info.videoUrl) {
    downloadResult = await downloadVideo(info.videoUrl, info.id);
  } else {
    logger.warn('No direct video URL found. Video may require cookie authentication.');
    throw new Error('Không thể lấy link tải video. Vui lòng kiểm tra cookie Douyin.');
  }

  return {
    ...info,
    localPath: downloadResult.path,
    fileSize: downloadResult.size,
  };
}

module.exports = {
  resolveShareUrl,
  getVideoInfo,
  downloadVideo,
  processDouyinUrl,
};
