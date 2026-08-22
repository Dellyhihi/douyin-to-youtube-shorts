const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { DOWNLOADS_DIR, extractDouyinId } = require('../utils/helpers');

// ─── Constants ───────────────────────────────────────────────────────────────

// Headers giả lập browser
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Referer': 'https://www.douyin.com/',
};

// TikWM API (Miễn phí, hỗ trợ cả TikTok lẫn Douyin share link)
const TIKWM_API = 'https://www.tikwm.com/api/';

// ─── Method 1: TikWM API (Best - No cookie needed) ───────────────────────────

/**
 * Tải thông tin video qua TikWM API (miễn phí, không cần cookie)
 * Hỗ trợ: TikTok link, Douyin share link (v.douyin.com)
 */
async function fetchViaTikWM(url) {
  logger.info(`[TikWM] Fetching: ${url}`);

  const formData = new URLSearchParams();
  formData.append('url', url);
  formData.append('hd', '1'); // Yêu cầu HD

  const response = await axios.post(TIKWM_API, formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.tikwm.com/',
      'Origin': 'https://www.tikwm.com',
    },
    timeout: 20000,
  });

  if (!response.data || response.data.code !== 0) {
    const msg = response.data?.msg || 'Unknown error';
    throw new Error(`TikWM API lỗi: ${msg}`);
  }

  const d = response.data.data;
  if (!d) throw new Error('TikWM API không trả về data');

  // Ưu tiên: play (không watermark) → hdplay → wmplay
  const videoUrl = d.play || d.hdplay || d.wmplay || null;
  if (!videoUrl) throw new Error('Không tìm thấy URL video trong response TikWM');

  return {
    id: d.id || extractDouyinId(url) || uuidv4().slice(0, 15),
    caption: d.title || '',
    author: d.author?.nickname || d.author?.unique_id || 'Unknown',
    videoUrl: videoUrl,
    hdVideoUrl: d.hdplay || d.play || null,
    coverUrl: d.cover || d.origin_cover || null,
    duration: d.duration || 0,
    width: 1080,   // TikWM không trả width/height, mặc định Shorts
    height: 1920,
    source: 'tikwm',
  };
}

// ─── Method 2: Direct Douyin Web API (Fallback - cần cookie) ─────────────────

/**
 * Resolve short URL v.douyin.com → full URL
 */
async function resolveShareUrl(shareUrl) {
  try {
    const response = await axios.get(shareUrl, {
      headers: BROWSER_HEADERS,
      maxRedirects: 5,
      validateStatus: s => s < 400,
      timeout: 10000,
    });
    // Sau redirect, lấy URL cuối
    return response.request?.res?.responseUrl || response.config?.url || shareUrl;
  } catch (error) {
    if (error.response?.headers?.location) {
      return error.response.headers.location;
    }
    // Trích URL từ text nếu được paste dạng share text
    const urlMatch = shareUrl.match(/https?:\/\/[^\s，,]+/);
    return urlMatch ? urlMatch[0] : shareUrl;
  }
}

/**
 * Tải thông tin video trực tiếp từ Douyin Web API
 * Cần có DOUYIN_COOKIE hợp lệ để dùng
 */
async function fetchViaDouyinAPI(videoId, cookie) {
  logger.info(`[Douyin API] Fetching video ID: ${videoId}`);

  const params = new URLSearchParams({
    aweme_id: videoId,
    aid: '6383',
    version_name: '26.5.0',
    device_platform: 'webapp',
    os: 'windows',
  });

  const response = await axios.get(
    `https://www.douyin.com/aweme/v1/web/aweme/detail/?${params}`,
    {
      headers: {
        ...BROWSER_HEADERS,
        'Cookie': cookie,
        'Referer': `https://www.douyin.com/video/${videoId}`,
      },
      timeout: 15000,
    }
  );

  if (!response.data?.aweme_detail) {
    throw new Error('Douyin API không trả về aweme_detail. Cookie có thể hết hạn.');
  }

  const detail = response.data.aweme_detail;
  const videoUrls = detail.video?.play_addr?.url_list || [];
  const noWmUrls  = detail.video?.download_addr?.url_list || videoUrls;

  // Chọn URL không watermark (replace playwm→play)
  const videoUrl = (noWmUrls[0] || videoUrls[0] || '').replace('playwm', 'play');

  if (!videoUrl) throw new Error('Không tìm thấy URL video trong Douyin API response');

  return {
    id: videoId,
    caption: detail.desc || '',
    author: detail.author?.nickname || 'Unknown',
    videoUrl,
    hdVideoUrl: videoUrl,
    coverUrl: detail.video?.cover?.url_list?.[0] || null,
    duration: Math.round((detail.video?.duration || 0) / 1000),
    width: detail.video?.width || 1080,
    height: detail.video?.height || 1920,
    source: 'douyin_api',
  };
}

// ─── Method 3: Douyin HTML Scrape (Last Resort) ───────────────────────────────

/**
 * Parse video URL từ HTML của trang Douyin (không cần cookie)
 */
async function fetchViaHTMLScrape(videoId, cookie = '') {
  logger.info(`[HTML Scrape] Fetching video ID: ${videoId}`);

  const pageUrl = `https://www.douyin.com/video/${videoId}`;
  const response = await axios.get(pageUrl, {
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': cookie,
    },
    timeout: 15000,
  });

  const html = response.data;

  // Pattern 1: __NEXT_DATA__ JSON
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const aweme = findNestedValue(data, 'aweme_detail') || findNestedValue(data, 'awemeDetail');
      if (aweme?.video?.play_addr?.url_list?.[0]) {
        return buildInfoFromAweme(videoId, aweme, 'scrape_next');
      }
    } catch (e) { /* continue */ }
  }

  // Pattern 2: RENDER_DATA
  const renderMatch = html.match(/<script id="RENDER_DATA"[^>]*>([\s\S]*?)<\/script>/);
  if (renderMatch) {
    try {
      const decoded = decodeURIComponent(renderMatch[1]);
      const data = JSON.parse(decoded);
      const aweme = findNestedValue(data, 'aweme_detail') || findNestedValue(data, 'awemeDetail');
      if (aweme?.video?.play_addr?.url_list?.[0]) {
        return buildInfoFromAweme(videoId, aweme, 'scrape_render');
      }
    } catch (e) { /* continue */ }
  }

  // Pattern 3: Inline JSON với play_addr
  const jsonMatches = html.matchAll(/"play_addr"\s*:\s*\{[^}]*"url_list"\s*:\s*\[(.*?)\]/gs);
  for (const match of jsonMatches) {
    try {
      const urlList = JSON.parse('[' + match[1] + ']');
      if (urlList[0]) {
        return {
          id: videoId,
          caption: '',
          author: 'Unknown',
          videoUrl: urlList[0].replace('playwm', 'play'),
          hdVideoUrl: urlList[0].replace('playwm', 'play'),
          coverUrl: null,
          duration: 0,
          width: 1080,
          height: 1920,
          source: 'scrape_inline',
        };
      }
    } catch (e) { /* continue */ }
  }

  throw new Error('Không thể trích xuất video URL từ trang HTML. Thử thêm cookie Douyin.');
}

function buildInfoFromAweme(videoId, aweme, source) {
  const urlList = aweme.video?.play_addr?.url_list || [];
  const dlList  = aweme.video?.download_addr?.url_list || urlList;
  const videoUrl = (dlList[0] || urlList[0] || '').replace('playwm', 'play');

  return {
    id: videoId,
    caption: aweme.desc || '',
    author: aweme.author?.nickname || 'Unknown',
    videoUrl,
    hdVideoUrl: videoUrl,
    coverUrl: aweme.video?.cover?.url_list?.[0] || null,
    duration: Math.round((aweme.video?.duration || 0) / 1000),
    width: aweme.video?.width || 1080,
    height: aweme.video?.height || 1920,
    source,
  };
}

function findNestedValue(obj, key, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return null;
  if (obj[key] !== undefined) return obj[key];
  for (const k of Object.keys(obj)) {
    const r = findNestedValue(obj[k], key, depth + 1);
    if (r) return r;
  }
  return null;
}

// ─── Main: Orchestrator với nhiều fallback ────────────────────────────────────

/**
 * Lấy thông tin video, thử nhiều cách theo thứ tự:
 * 1. TikWM API  (không cần cookie, hỗ trợ cả TikTok lẫn Douyin share link)
 * 2. Douyin Web API (cần cookie)
 * 3. HTML Scrape (fallback cuối)
 */
async function getVideoInfo(url) {
  // Làm sạch URL (trích URL từ share text nếu cần)
  const cleanUrl = extractCleanUrl(url);
  logger.info(`Processing URL: ${cleanUrl}`);

  const cookie = process.env.DOUYIN_COOKIE || '';
  const errors = [];

  // ── Attempt 1: TikWM API ──────────────────────────────────────────────────
  try {
    const info = await fetchViaTikWM(cleanUrl);
    logger.success(`[TikWM] ✓ Got video: "${info.caption}" by ${info.author}`);
    return info;
  } catch (err) {
    errors.push(`TikWM: ${err.message}`);
    logger.warn(`[TikWM] Failed: ${err.message}`);
  }

  // Resolve short URL nếu là v.douyin.com
  let fullUrl = cleanUrl;
  let videoId = extractDouyinId(cleanUrl);

  if (!videoId || cleanUrl.includes('v.douyin.com') || cleanUrl.includes('vm.douyin.com')) {
    try {
      fullUrl = await resolveShareUrl(cleanUrl);
      logger.info(`Resolved to: ${fullUrl}`);
      videoId = extractDouyinId(fullUrl) || videoId;
    } catch (err) {
      logger.warn(`Could not resolve URL: ${err.message}`);
    }
  }

  if (!videoId) {
    throw new Error(`Không thể phân tích Video ID từ URL: ${cleanUrl}`);
  }

  // ── Attempt 2: Douyin Web API (chỉ khi có cookie) ────────────────────────
  if (cookie) {
    try {
      const info = await fetchViaDouyinAPI(videoId, cookie);
      logger.success(`[Douyin API] ✓ Got video: "${info.caption}" by ${info.author}`);
      return info;
    } catch (err) {
      errors.push(`Douyin API: ${err.message}`);
      logger.warn(`[Douyin API] Failed: ${err.message}`);
    }
  } else {
    logger.warn('[Douyin API] Skipped - DOUYIN_COOKIE not configured');
  }

  // ── Attempt 3: HTML Scrape ────────────────────────────────────────────────
  try {
    const info = await fetchViaHTMLScrape(videoId, cookie);
    logger.success(`[HTML Scrape] ✓ Got video URL via scraping`);
    return info;
  } catch (err) {
    errors.push(`HTML Scrape: ${err.message}`);
    logger.warn(`[HTML Scrape] Failed: ${err.message}`);
  }

  // ── All methods failed ────────────────────────────────────────────────────
  const summary = errors.join(' | ');
  throw new Error(
    `Không thể tải video sau 3 cách thử.\n\nChi tiết lỗi:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}\n\nGợi ý:\n- Kiểm tra lại link Douyin có đúng và video không bị xóa.\n- Thêm DOUYIN_COOKIE vào .env để cải thiện khả năng tải.`
  );
}

/**
 * Trích URL sạch từ share text (vd: "7 Khám phá bộ sưu tập... https://v.douyin.com/xxx")
 */
function extractCleanUrl(text) {
  if (!text) return text;
  text = text.trim();

  // Nếu đã là URL thuần
  if (text.startsWith('http')) return text;

  // Tìm URL trong share text
  const match = text.match(/https?:\/\/[^\s，,\u3000]+/);
  return match ? match[0] : text;
}

// ─── Download File ────────────────────────────────────────────────────────────

/**
 * Tải file video về máy
 */
async function downloadVideoFile(videoUrl, videoId) {
  if (!videoUrl) throw new Error('Không có URL video để tải');

  const filename = `${videoId}_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOADS_DIR, filename);

  logger.download(`Downloading: ${videoId}`);
  logger.download(`URL: ${videoUrl.substring(0, 80)}...`);

  const response = await axios.get(videoUrl, {
    headers: {
      ...BROWSER_HEADERS,
      'Range': 'bytes=0-',
    },
    responseType: 'stream',
    timeout: 120000,
    maxRedirects: 10,
  });

  const writer = fs.createWriteStream(filepath);
  const totalSize = parseInt(response.headers['content-length'] || '0', 10);
  let downloaded = 0;

  return new Promise((resolve, reject) => {
    response.data.on('data', chunk => {
      downloaded += chunk.length;
      if (totalSize > 0) {
        const pct = ((downloaded / totalSize) * 100).toFixed(1);
        process.stdout.write(`\r  ⬇️  ${pct}% (${(downloaded / 1024 / 1024).toFixed(2)} / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
      }
    });

    response.data.pipe(writer);

    writer.on('finish', () => {
      console.log('');
      const stats = fs.statSync(filepath);
      if (stats.size < 10000) {
        fs.unlinkSync(filepath);
        reject(new Error('File tải về quá nhỏ (< 10KB). Có thể bị block hoặc URL hết hạn.'));
        return;
      }
      logger.success(`Downloaded: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      resolve({ path: filepath, filename, size: stats.size });
    });

    writer.on('error', err => {
      try { fs.unlinkSync(filepath); } catch (_) {}
      reject(new Error(`Lỗi ghi file: ${err.message}`));
    });

    response.data.on('error', err => {
      try { fs.unlinkSync(filepath); } catch (_) {}
      reject(new Error(`Lỗi stream download: ${err.message}`));
    });
  });
}

// ─── Main Public API ──────────────────────────────────────────────────────────

/**
 * Pipeline đầy đủ: lấy info + tải file
 */
async function processDouyinUrl(url) {
  const info = await getVideoInfo(url);

  // Thử HD trước, rồi fallback sang SD
  let downloadResult;
  const urlToTry = info.hdVideoUrl || info.videoUrl;
  try {
    downloadResult = await downloadVideoFile(urlToTry, info.id);
  } catch (err) {
    if (info.videoUrl && info.videoUrl !== urlToTry) {
      logger.warn(`HD download failed, trying SD: ${err.message}`);
      downloadResult = await downloadVideoFile(info.videoUrl, info.id);
    } else {
      throw err;
    }
  }

  return {
    ...info,
    localPath: downloadResult.path,
    fileSize: downloadResult.size,
  };
}

module.exports = {
  processDouyinUrl,
  getVideoInfo,
  downloadVideoFile,
  extractCleanUrl,
};
