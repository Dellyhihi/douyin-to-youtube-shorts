const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Upload a video file to Gemini File API for processing
 */
async function uploadVideoToGemini(filePath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình. Vui lòng thêm vào .env');
  }

  const fileSize = fs.statSync(filePath).size;
  const mimeType = 'video/mp4';
  const displayName = path.basename(filePath);

  logger.info(`Uploading video to Gemini API (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

  // Step 1: Start resumable upload
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
      timeout: 120000,
    }
  );

  const fileInfo = initResponse.data.file;
  logger.info(`File uploaded: ${fileInfo.name}, state: ${fileInfo.state}`);

  // Step 2: Wait for processing
  let file = fileInfo;
  let attempts = 0;
  while (file.state === 'PROCESSING' && attempts < 60) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const statusResponse = await axios.get(
      `${GEMINI_API_BASE}/files/${file.name.split('/').pop()}?key=${apiKey}`
    );
    file = statusResponse.data;
    attempts++;
    logger.info(`Processing video... (attempt ${attempts})`);
  }

  if (file.state !== 'ACTIVE') {
    throw new Error(`Video processing failed. State: ${file.state}`);
  }

  logger.success('Video processed by Gemini successfully');
  return file;
}

/**
 * Generate caption, description, and tags using Gemini
 */
async function generateCaption(filePath, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình');
  }

  const language = options.language || process.env.CAPTION_LANGUAGE || 'vi';
  const style = options.style || process.env.CAPTION_STYLE || 'trending';
  const originalCaption = options.originalCaption || '';

  // Upload video to Gemini
  const file = await uploadVideoToGemini(filePath);

  // Build the prompt
  const langMap = {
    'vi': 'tiếng Việt',
    'en': 'English',
    'vi-en': 'tiếng Việt (title) và English (description)',
  };

  const styleMap = {
    'funny': 'hài hước, vui nhộn, dùng từ ngữ gen Z',
    'serious': 'chuyên nghiệp, nghiêm túc, nhiều thông tin',
    'trending': 'trending, bắt trend, viral, gây tò mò',
    'motivational': 'truyền cảm hứng, motivational, tích cực',
  };

  const langInstruction = langMap[language] || langMap['vi'];
  const styleInstruction = styleMap[style] || styleMap['trending'];

  const prompt = `Bạn là chuyên gia sáng tạo nội dung YouTube Shorts hàng đầu. Hãy phân tích video này và tạo nội dung SEO tối ưu.

${originalCaption ? `Caption gốc từ Douyin: "${originalCaption}"` : ''}

YÊU CẦU:
- Ngôn ngữ: ${langInstruction}
- Phong cách: ${styleInstruction}

Hãy tạo:
1. **title**: Tiêu đề hấp dẫn, gây tò mò, PHẢI kết thúc bằng " #Shorts". Tối đa 95 ký tự (không tính #Shorts).
2. **description**: Mô tả chi tiết 2-3 câu, giải thích nội dung video. Thêm 5-8 hashtag phổ biến liên quan ở cuối. Mỗi hashtag trên 1 dòng mới.
3. **tags**: Mảng 10-15 tags SEO liên quan (không có dấu #).
4. **category**: Chọn 1 trong: Entertainment, Education, Science & Technology, People & Blogs, Comedy, Sports, Music, Film & Animation, Howto & Style, Gaming, News & Politics, Pets & Animals, Travel & Events.

QUAN TRỌNG: Trả về ĐÚNG JSON format, không thêm text thừa.

{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "..."],
  "category": "..."
}`;

  logger.info('Generating caption with Gemini AI...');

  const response = await axios.post(
    `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [
        {
          parts: [
            {
              fileData: {
                mimeType: file.mimeType,
                fileUri: file.uri,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    }
  );

  // Parse the response
  const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini không trả về kết quả');
  }

  try {
    const result = JSON.parse(text);

    // Ensure #Shorts is in title
    if (!result.title.includes('#Shorts')) {
      result.title = result.title.trim() + ' #Shorts';
    }

    // Ensure #Shorts is in description
    if (!result.description.includes('#Shorts')) {
      result.description += '\n\n#Shorts';
    }

    logger.success(`Caption generated: "${result.title}"`);

    // Clean up: delete the uploaded file from Gemini
    try {
      await axios.delete(`${GEMINI_API_BASE}/files/${file.name.split('/').pop()}?key=${apiKey}`);
    } catch (e) {
      // Ignore cleanup errors
    }

    return result;
  } catch (parseError) {
    // Try to extract JSON from the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`Không thể parse kết quả AI: ${text.substring(0, 200)}`);
  }
}

/**
 * Generate caption without video upload (text-only, faster)
 */
async function generateCaptionFromText(originalCaption, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình');
  }

  const language = options.language || process.env.CAPTION_LANGUAGE || 'vi';
  const style = options.style || process.env.CAPTION_STYLE || 'trending';

  const langMap = {
    'vi': 'tiếng Việt',
    'en': 'English',
    'vi-en': 'tiếng Việt (title) và English (description)',
  };
  const styleMap = {
    'funny': 'hài hước, vui nhộn, gen Z',
    'serious': 'chuyên nghiệp, nhiều thông tin',
    'trending': 'trending, viral, gây tò mò',
    'motivational': 'truyền cảm hứng, tích cực',
  };

  const prompt = `Dựa trên caption gốc từ video ngắn: "${originalCaption}"

Tạo nội dung YouTube Shorts bằng ${langMap[language] || 'tiếng Việt'}, phong cách ${styleMap[style] || 'trending'}.

Trả về JSON:
{
  "title": "tiêu đề hấp dẫn, max 95 ký tự, kết thúc bằng #Shorts",
  "description": "mô tả 2-3 câu + 5-8 hashtag",
  "tags": ["10-15 tags SEO"],
  "category": "Entertainment/Education/etc."
}`;

  const response = await axios.post(
    `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );

  const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini không trả về kết quả');

  const result = JSON.parse(text);
  if (!result.title.includes('#Shorts')) {
    result.title = result.title.trim() + ' #Shorts';
  }
  return result;
}

module.exports = {
  generateCaption,
  generateCaptionFromText,
  uploadVideoToGemini,
};
