const fs = require('fs');
const path = require('path');
const os = require('os');

const isServerless = !!process.env.VERCEL;
const DOWNLOADS_DIR = isServerless
  ? path.join(os.tmpdir(), 'douyin-app-downloads')
  : path.join(__dirname, '..', '..', 'downloads');
const THUMBNAILS_DIR = isServerless
  ? path.join(os.tmpdir(), 'douyin-app-thumbnails')
  : path.join(__dirname, '..', '..', 'thumbnails');

// Ensure directories exist
[DOWNLOADS_DIR, THUMBNAILS_DIR].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    console.warn(`Could not create directory ${dir}:`, e.message);
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 100);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDouyinId(url) {
  // Match various Douyin URL patterns
  const patterns = [
    /video\/(\d+)/,
    /note\/(\d+)/,
    /\/(\d{15,})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

module.exports = {
  DOWNLOADS_DIR,
  THUMBNAILS_DIR,
  formatBytes,
  formatDuration,
  sanitizeFilename,
  sleep,
  extractDouyinId,
};
