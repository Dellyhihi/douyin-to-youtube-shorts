const fs = require('fs');
const path = require('path');
const os = require('os');

const isServerless = !!process.env.VERCEL;
const LOG_DIR = isServerless
  ? path.join(os.tmpdir(), 'douyin-app-logs')
  : path.join(__dirname, '..', '..', 'data', 'logs');

try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {
  // Silent fail in serverless
}

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

const logger = {
  info(msg, ...args) {
    console.log(`${colors.blue}[INFO]${colors.reset} ${colors.gray}${timestamp()}${colors.reset} ${msg}`, ...args);
  },
  success(msg, ...args) {
    console.log(`${colors.green}[OK]${colors.reset} ${colors.gray}${timestamp()}${colors.reset} ${msg}`, ...args);
  },
  warn(msg, ...args) {
    console.log(`${colors.yellow}[WARN]${colors.reset} ${colors.gray}${timestamp()}${colors.reset} ${msg}`, ...args);
  },
  error(msg, ...args) {
    console.error(`${colors.red}[ERROR]${colors.reset} ${colors.gray}${timestamp()}${colors.reset} ${msg}`, ...args);
  },
  download(msg, ...args) {
    console.log(`${colors.cyan}[DOWNLOAD]${colors.reset} ${colors.gray}${timestamp()}${colors.reset} ${msg}`, ...args);
  },
  upload(msg, ...args) {
    console.log(`${colors.magenta}[UPLOAD]${colors.reset} ${colors.gray}${timestamp()}${colors.reset} ${msg}`, ...args);
  },
};

module.exports = logger;
