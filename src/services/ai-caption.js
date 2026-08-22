const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function isGeminiConfigured() {
  const key = process.env.GEMINI_API_KEY;
  return key && !key.startsWith('your_') && key.length > 20;
}

/**
 * Generate structured metadata from original caption or default template
 */
function createFallbackMetadata(originalCaption = '') {
  let title = originalCaption.trim() || 'Video Douyin #Shorts';
  if (!title.toLowerCase().includes('#shorts')) {
    title = `${title.substring(0, 80)} #Shorts`;
  }

  // Extract hashtags from caption
  const hashtags = (originalCaption.match(/#[\w\u4e00-\u9fa5\u00C0-\u1EF9]+/g) || [])
    .map(t => t.replace('#', ''))
    .slice(0, 10);

  const defaultTags = ['shorts', 'douyin', 'viral', 'trending', ...hashtags];

  return {
    title: title.substring(0, 100),
    description: `${originalCaption}\n\n#Shorts #Viral #Trending`,
    tags: Array.from(new Set(defaultTags)),
    category: 'Entertainment',
  };
}

/**
 * Upload a video file to Gemini File API for processing
 */
async function uploadVideoToGemini(filePath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình hợp lệ.');
  }

  const fileSize = fs.statSync(filePath).size;
  const mimeType = 'video/mp4';

  logger.info(`Uploading video to Gemini API (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

  const initResponse = await axios.post(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    fs.readFileSync(filePath),
    {
      headers: {
        'Content-Type': mimeType,
        'X-Goog-Upload-Protocol': 'raw',
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Header-Content-Length': fileSize,
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000,
    }
  );

  const fileInfo = initResponse.data.file;
  let file = fileInfo;
  let attempts = 0;
  while (file.state === 'PROCESSING' && attempts < 20) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const statusResponse = await axios.get(
      `${GEMINI_API_BASE}/files/${file.name.split('/').pop()}?key=${apiKey}`,
      { timeout: 10000 }
    );
    file = statusResponse.data;
    attempts++;
  }

  if (file.state !== 'ACTIVE') {
    throw new Error(`Video processing state: ${file.state}`);
  }

  return file.uri;
}

/**
 * Generate YouTube Shorts metadata using Gemini AI
 */
async function generateCaption(videoPath, options = {}) {
  const originalCaption = options.originalCaption || '';

  if (!isGeminiConfigured()) {
    logger.info('Gemini API key not configured, using smart fallback caption');
    return createFallbackMetadata(originalCaption);
  }

  try {
    const fileUri = await uploadVideoToGemini(videoPath);
    const apiKey = process.env.GEMINI_API_KEY;
    const lang = process.env.CAPTION_LANGUAGE || 'vi';
    const style = process.env.CAPTION_STYLE || 'trending';

    const prompt = `Phân tích video này và tạo metadata đăng lên YouTube Shorts:
1. Title: Giật tít, hấp dẫn, có #Shorts ở cuối (tối đa 100 ký tự).
2. Description: Mô tả ngắn gọn + hashtag liên quan.
3. Tags: 5-10 tags.
4. Category: Danh mục phù hợp.
Ngôn ngữ: ${lang}, phong cách: ${style}.
Original Caption: "${originalCaption}"

Trả về JSON duy nhất:
{"title": "...", "description": "...", "tags": ["tag1", "tag2"], "category": "Entertainment"}`;

    const response = await axios.post(
      `${GEMINI_API_BASE}/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              { fileData: { mimeType: 'video/mp4', fileUri: fileUri } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      },
      { timeout: 30000 }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty AI response');
    const result = JSON.parse(text);

    return {
      title: result.title || createFallbackMetadata(originalCaption).title,
      description: result.description || originalCaption,
      tags: result.tags || ['shorts', 'viral'],
      category: result.category || 'Entertainment',
    };
  } catch (error) {
    logger.warn(`AI generation failed: ${error.message}, using fallback metadata`);
    return createFallbackMetadata(originalCaption);
  }
}

/**
 * Generate metadata from text only
 */
async function generateCaptionFromText(originalCaption) {
  if (!isGeminiConfigured()) {
    return createFallbackMetadata(originalCaption);
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = `Tạo metadata YouTube Shorts từ caption Douyin: "${originalCaption}".
Trả về JSON duy nhất: {"title": "...", "description": "...", "tags": ["..."], "category": "Entertainment"}`;

    const response = await axios.post(
      `${GEMINI_API_BASE}/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      },
      { timeout: 15000 }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  } catch (e) {
    return createFallbackMetadata(originalCaption);
  }
}

module.exports = {
  isGeminiConfigured,
  generateCaption,
  generateCaptionFromText,
  createFallbackMetadata,
};
