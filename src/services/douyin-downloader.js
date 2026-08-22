const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { DOWNLOADS_DIR, extractDouyinId } = require('../utils/helpers');

// ─── Browser Headers ─────────────────────────────────────────────────────────
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Referer': 'https://www.douyin.com/',
};

// Cached TTWID cookie
let cachedTtwid = null;
let ttwidExpiry = 0;

/**
 * Tự động tạo TTWID cookie miễn phí từ ByteDance
 */
async function getAutoTtwid() {
  const now = Date.now();
  if (cachedTtwid && now < ttwidExpiry) {
    return cachedTtwid;
  }

  try {
    const postData = {
      region: 'cn',
      aid: 1768,
      needFid: 'false',
      service: 'www.ixigua.com',
      migrate_info: { ticket: '', src: 'ucdr' },
      union: true,
    };

    const res = await axios.post('https://ttwid.bytedance.com/ttwid/union/register/', postData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });

    const setCookie = res.headers['set-cookie'] || [];
    const match = setCookie.join(';').match(/ttwid=([^;]+)/);
    if (match) {
      cachedTtwid = match[1];
      ttwidExpiry = now + 6 * 3600 * 1000; // Cache 6 hours
      logger.info('Auto-generated TTWID cookie from ByteDance');
      return cachedTtwid;
    }
  } catch (e) {
    logger.warn(`Failed to auto-generate ttwid: ${e.message}`);
  }

  return process.env.DOUYIN_COOKIE || '';
}

/**
 * Trích xuất URL sạch từ bất kỳ dạng input nào:
 *  - "5.87 06/04... 悟空队vs超人队 https://v.douyin.com/qLENPvwvgvw/ 复制此链接..."
 *  - "https://www.douyin.com/video/7676331104857997940"
 *  - "https://vm.tiktok.com/ZMhN8Bg6x/"
 *  - "https://www.douyin.com/aweme/v1/play/?video_id=..."
 */
function extractCleanUrl(text) {
  if (!text) return '';
  text = text.trim();

  // Nếu là URL trực tiếp
  if (/^https?:\/\/\S+$/.test(text)) return text;

  // Tìm tất cả các link http/https trong đoạn văn bản
  const matches = [...text.matchAll(/https?:\/\/[^\s，,\u3000\u4e00-\u9fa5]+/g)].map(m => m[0]);
  if (matches.length === 0) return text;

  // Ưu tiên link Douyin / TikTok nếu có nhiều link
  const priority = matches.find(u =>
    u.includes('v.douyin.com') ||
    u.includes('douyin.com') ||
    u.includes('tiktok.com')
  );

  const chosen = priority || matches[0];
  return chosen.replace(/[.,!?;:)\]>]+$/, '');
}

/**
 * Kiểm tra xem có phải URL stream trực tiếp (từ bot hoặc play API)
 */
function isDirectPlayUrl(url) {
  if (!url) return false;
  return (
    url.includes('/aweme/v1/play') ||
    url.includes('douyinvod.com') ||
    url.includes('tiktokcdn') ||
    url.includes('tiktokv.com') ||
    url.includes('zjcdn.com') ||
    /\/video\/tos\//i.test(url) ||
    url.includes('mime_type=video')
  );
}

/**
 * Theo dõi chuyển hướng để lấy URL đích (v.douyin.com -> douyin.com/video/ID)
 */
async function resolveShareUrl(shareUrl) {
  try {
    const response = await axios.get(shareUrl, {
      headers: BROWSER_HEADERS,
      maxRedirects: 5,
      validateStatus: s => s < 400,
      timeout: 10000,
    });
    return response.request?.res?.responseUrl || response.config?.url || shareUrl;
  } catch (error) {
    if (error.response?.headers?.location) {
      return error.response.headers.location;
    }
    return shareUrl;
  }
}

/**
 * Phân tích video ID từ URL bất kỳ
 */
function parseVideoId(url) {
  if (!url) return null;
  const patterns = [
    /video\/(\d+)/,
    /note\/(\d+)/,
    /item_ids=(\d+)/,
    /\/(\d{18,20})/,
    /\/(\d{15,})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Method 1: Tải video Douyin bằng ByteDance TTWID + Web Detail API
 */
async function fetchDouyinDetail(videoId) {
  const ttwid = await getAutoTtwid();
  const detailUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=1128&version_name=23.5.0&device_platform=webapp&os=windows`;

  const cookieStr = ttwid.startsWith('ttwid=') ? ttwid : `ttwid=${ttwid};`;

  const response = await axios.get(detailUrl, {
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': cookieStr,
      'Referer': `https://www.douyin.com/video/${videoId}`,
    },
    timeout: 15000,
  });

  const detail = response.data?.aweme_detail;
  if (!detail) {
    throw new Error('Douyin API không trả về aweme_detail');
  }

  const videoUrls = detail.video?.play_addr?.url_list || [];
  const noWmUrls = detail.video?.download_addr?.url_list || videoUrls;
  const videoUrl = (noWmUrls[0] || videoUrls[0] || '').replace('playwm', 'play');

  if (!videoUrl) throw new Error('Không tìm thấy link stream video');

  return {
    id: videoId,
    caption: detail.desc || '',
    author: detail.author?.nickname || 'Douyin Creator',
    videoUrl,
    hdVideoUrl: videoUrl,
    coverUrl: detail.video?.cover?.url_list?.[0] || null,
    duration: Math.round((detail.video?.duration || 0) / 1000),
    width: detail.video?.width || 1080,
    height: detail.video?.height || 1920,
    source: 'douyin_aweme_detail',
  };
}

/**
 * Method 2: TikWM API (cho TikTok hoặc fallback)
 */
async function fetchViaTikWM(url) {
  const formData = new URLSearchParams();
  formData.append('url', url);
  formData.append('hd', '1');

  const response = await axios.post('https://www.tikwm.com/api/', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': BROWSER_HEADERS['User-Agent'],
    },
    timeout: 15000,
  });

  if (!response.data || response.data.code !== 0) {
    throw new Error(`TikWM error: ${response.data?.msg || 'failed'}`);
  }

  const d = response.data.data;
  return {
    id: d.id || parseVideoId(url) || uuidv4().slice(0, 15),
    caption: d.title || '',
    author: d.author?.nickname || 'TikTok Creator',
    videoUrl: d.play || d.hdplay || d.wmplay,
    hdVideoUrl: d.hdplay || d.play,
    coverUrl: d.cover || d.origin_cover || null,
    duration: d.duration || 0,
    width: 1080,
    height: 1920,
    source: 'tikwm',
  };
}

/**
 * Lấy thông tin video đầy đủ từ link Douyin hoặc TikTok
 */
async function getVideoInfo(rawUrl) {
  const cleanUrl = extractCleanUrl(rawUrl);
  logger.info(`Getting video info for: ${cleanUrl}`);

  // Nếu là link TikTok
  if (cleanUrl.includes('tiktok.com')) {
    try {
      return await fetchViaTikWM(cleanUrl);
    } catch (e) {
      logger.warn(`TikWM failed: ${e.message}`);
    }
  }

  // 1. Resolve link ngắn (v.douyin.com -> douyin.com/video/ID)
  let resolvedUrl = cleanUrl;
  if (cleanUrl.includes('v.douyin.com') || cleanUrl.includes('vm.douyin.com')) {
    resolvedUrl = await resolveShareUrl(cleanUrl);
    logger.info(`Resolved Douyin URL: ${resolvedUrl}`);
  }

  // 2. Trích xuất video ID
  const videoId = parseVideoId(resolvedUrl) || parseVideoId(cleanUrl);
  if (!videoId) {
    throw new Error(`Không thể tìm thấy ID video từ link: ${cleanUrl}`);
  }

  logger.info(`Extracted Douyin ID: ${videoId}`);

  // 3. Lấy thông tin & link không watermark qua Douyin API
  try {
    return await fetchDouyinDetail(videoId);
  } catch (e) {
    logger.warn(`Douyin detail failed: ${e.message}, trying TikWM fallback...`);
    try {
      return await fetchViaTikWM(cleanUrl);
    } catch (e2) {
      throw new Error(`Lỗi tải thông tin Douyin video (${videoId}): ${e.message}`);
    }
  }
}

/**
 * Tải file video MP4 lưu vào thư mục downloads/
 */
async function downloadVideoFile(videoUrl, videoId) {
  if (!videoUrl) throw new Error('Không có URL stream để tải');

  const filename = `${videoId}_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOADS_DIR, filename);

  logger.download(`Starting download for video ${videoId}...`);

  const response = await axios.get(videoUrl, {
    headers: {
      ...BROWSER_HEADERS,
      'Range': 'bytes=0-',
    },
    responseType: 'stream',
    timeout: 300000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
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
        try { fs.unlinkSync(filepath); } catch (_) {}
        reject(new Error('File tải về quá nhỏ (< 10KB), có thể link đã hết hạn'));
        return;
      }
      logger.success(`Downloaded successfully: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      resolve({ path: filepath, filename, size: stats.size });
    });

    writer.on('error', err => {
      try { fs.unlinkSync(filepath); } catch (_) {}
      reject(new Error(`Lỗi ghi file: ${err.message}`));
    });

    response.data.on('error', err => {
      try { fs.unlinkSync(filepath); } catch (_) {}
      reject(new Error(`Lỗi stream: ${err.message}`));
    });
  });
}

/**
 * Pipeline hoàn chỉnh xử lý bất kỳ link nào
 */
async function processDouyinUrl(rawInput) {
  const cleanUrl = extractCleanUrl(rawInput);

  // Trường hợp 1: Link direct stream URL (từ bot tele, vv.)
  if (isDirectPlayUrl(cleanUrl)) {
    logger.info(`[Direct] Direct stream link detected: ${cleanUrl.substring(0, 60)}...`);
    let videoId = `direct_${Date.now()}`;
    try {
      const parsed = new URL(cleanUrl);
      videoId = parsed.searchParams.get('video_id') || videoId;
    } catch (_) {}

    const dl = await downloadVideoFile(cleanUrl, videoId);
    return {
      id: videoId,
      caption: 'Video tải trực tiếp',
      author: 'Direct Download',
      videoUrl: cleanUrl,
      hdVideoUrl: cleanUrl,
      coverUrl: null,
      duration: 0,
      width: 1080,
      height: 1920,
      localPath: dl.path,
      fileSize: dl.size,
    };
  }

  // Trường hợp 2: Link Douyin (share text, v.douyin.com, douyin.com/video/...) hoặc TikTok
  const info = await getVideoInfo(cleanUrl);
  const dl = await downloadVideoFile(info.hdVideoUrl || info.videoUrl, info.id);

  return {
    ...info,
    localPath: dl.path,
    fileSize: dl.size,
  };
}

module.exports = {
  processDouyinUrl,
  getVideoInfo,
  downloadVideoFile,
  extractCleanUrl,
  parseVideoId,
  isDirectPlayUrl,
};
