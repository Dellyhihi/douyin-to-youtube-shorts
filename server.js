require('dotenv').config();

const express = require('express');
const path = require('path');
const logger = require('./src/utils/logger');

// Initialize database (creates tables/store on first run)
require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));

// CORS (for development & multi-origin)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging
app.use((req, res, next) => {
  if (!req.url.startsWith('/css') && !req.url.startsWith('/js') && !req.url.startsWith('/thumbnails')) {
    logger.info(`${req.method} ${req.url}`);
  }
  next();
});

// ─── Routes ───
app.use('/api', require('./src/routes/api'));
app.use('/auth', require('./src/routes/auth'));

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error handler ───
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Start server (if run directly or not on Vercel serverless) ───
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║                                              ║');
    console.log('  ║   🚀 Douyin → YouTube Shorts Tool            ║');
    console.log('  ║                                              ║');
    console.log(`  ║   🌐 http://localhost:${PORT}                    ║`);
    console.log('  ║                                              ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');

    // Check configuration
    if (!process.env.GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY chưa cấu hình → AI caption sẽ không hoạt động');
    } else {
      logger.success('Gemini API Key: ✓ configured');
    }

    if (!process.env.YOUTUBE_CLIENT_ID) {
      logger.warn('YouTube OAuth chưa cấu hình → Upload sẽ không hoạt động');
    } else {
      logger.success('YouTube OAuth: ✓ configured');
    }
  });
}

module.exports = app;
