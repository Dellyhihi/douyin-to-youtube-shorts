const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

const isServerless = !!process.env.VERCEL;
const DATA_DIR = isServerless
  ? path.join(os.tmpdir(), 'douyin-app-data')
  : path.join(__dirname, '..', '..', 'data');
const TOKENS_PATH = path.join(DATA_DIR, 'youtube_tokens.json');

// YouTube category IDs
const CATEGORY_MAP = {
  'Film & Animation': '1',
  'Autos & Vehicles': '2',
  'Music': '10',
  'Pets & Animals': '15',
  'Sports': '17',
  'Travel & Events': '19',
  'Gaming': '20',
  'People & Blogs': '22',
  'Comedy': '23',
  'Entertainment': '24',
  'News & Politics': '25',
  'Howto & Style': '26',
  'Education': '27',
  'Science & Technology': '28',
  'Nonprofits & Activism': '29',
};

/**
 * Create OAuth2 client from environment variables
 */
function createOAuth2Client() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/auth/youtube/callback';

  if (!clientId || !clientSecret) {
    throw new Error('YouTube OAuth credentials chưa được cấu hình. Cần YOUTUBE_CLIENT_ID và YOUTUBE_CLIENT_SECRET.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate the OAuth2 authorization URL
 */
function getAuthUrl() {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
  });
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCode(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // Save tokens
  const dataDir = path.dirname(TOKENS_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));

  logger.success('YouTube tokens saved successfully');
  return tokens;
}

/**
 * Get authenticated YouTube client
 */
function getAuthenticatedClient() {
  if (!fs.existsSync(TOKENS_PATH)) {
    throw new Error('Chưa đăng nhập YouTube. Vui lòng kết nối tài khoản YouTube trước.');
  }

  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);

  // Auto-refresh expired tokens
  oauth2Client.on('tokens', (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    try {
      fs.writeFileSync(TOKENS_PATH, JSON.stringify(updated, null, 2));
      logger.info('YouTube tokens refreshed');
    } catch (e) {
      logger.warn('Could not persist refreshed tokens:', e.message);
    }
  });

  return google.youtube({ version: 'v3', auth: oauth2Client });
}

/**
 * Check if YouTube is authenticated
 */
function isAuthenticated() {
  if (!fs.existsSync(TOKENS_PATH)) return false;
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    return !!tokens.access_token;
  } catch {
    return false;
  }
}

/**
 * Get channel info for the authenticated user
 */
async function getChannelInfo() {
  const youtube = getAuthenticatedClient();

  const response = await youtube.channels.list({
    part: 'snippet,statistics',
    mine: true,
  });

  const channel = response.data.items?.[0];
  if (!channel) throw new Error('Không tìm thấy channel');

  return {
    id: channel.id,
    title: channel.snippet.title,
    thumbnail: channel.snippet.thumbnails.default?.url,
    subscriberCount: channel.statistics.subscriberCount,
    videoCount: channel.statistics.videoCount,
  };
}

/**
 * Upload a video to YouTube Shorts
 */
async function uploadVideo(filePath, metadata = {}) {
  const youtube = getAuthenticatedClient();

  const title = metadata.title || 'Untitled #Shorts';
  const description = metadata.description || '';
  const tags = metadata.tags || [];
  const category = metadata.category || 'Entertainment';
  const privacy = metadata.privacy || process.env.DEFAULT_PRIVACY || 'unlisted';

  const categoryId = CATEGORY_MAP[category] || '24'; // Default: Entertainment

  logger.upload(`Uploading: "${title}"`);
  logger.upload(`Privacy: ${privacy}, Category: ${category}`);

  const fileSize = fs.statSync(filePath).size;
  logger.upload(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  const response = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: title.substring(0, 100),
        description: description.substring(0, 5000),
        tags: tags.slice(0, 30),
        categoryId: categoryId,
        defaultLanguage: 'vi',
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(filePath),
    },
  });

  const videoId = response.data.id;
  const videoUrl = `https://youtube.com/shorts/${videoId}`;

  logger.success(`Upload successful! Video ID: ${videoId}`);
  logger.success(`URL: ${videoUrl}`);

  return {
    videoId,
    videoUrl,
    title: response.data.snippet?.title,
  };
}

/**
 * Set custom thumbnail for a video
 */
async function setThumbnail(videoId, thumbnailPath) {
  const youtube = getAuthenticatedClient();

  try {
    await youtube.thumbnails.set({
      videoId: videoId,
      media: {
        mimeType: 'image/jpeg',
        body: fs.createReadStream(thumbnailPath),
      },
    });

    logger.success(`Thumbnail set for video ${videoId}`);
    return true;
  } catch (error) {
    logger.warn(`Failed to set thumbnail: ${error.message}`);
    return false;
  }
}

/**
 * Disconnect YouTube (remove tokens)
 */
function disconnect() {
  if (fs.existsSync(TOKENS_PATH)) {
    fs.unlinkSync(TOKENS_PATH);
    logger.info('YouTube disconnected');
  }
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  isAuthenticated,
  getChannelInfo,
  uploadVideo,
  setThumbnail,
  disconnect,
};
