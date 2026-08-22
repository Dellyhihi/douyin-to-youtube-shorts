const express = require('express');
const router = express.Router();
const youtubeUploader = require('../services/youtube-uploader');
const logger = require('../utils/logger');

// ─── Get YouTube auth status ───
router.get('/youtube/status', async (req, res) => {
  try {
    const connected = youtubeUploader.isAuthenticated();

    if (connected) {
      try {
        const channel = await youtubeUploader.getChannelInfo();
        return res.json({
          success: true,
          data: { connected: true, channel },
        });
      } catch (error) {
        return res.json({
          success: true,
          data: { connected: true, channel: null, error: 'Token may be expired' },
        });
      }
    }

    res.json({ success: true, data: { connected: false } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Start YouTube OAuth flow ───
router.get('/youtube/login', (req, res) => {
  try {
    const authUrl = youtubeUploader.getAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── YouTube OAuth callback ───
router.get('/youtube/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Authorization code missing');
    }

    await youtubeUploader.exchangeCode(code);
    logger.success('YouTube OAuth successful!');

    // Redirect back to dashboard with success message
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>YouTube Connected!</title>
        <style>
          body {
            background: #0a0a1a;
            color: #e0e0ff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: 'Segoe UI', sans-serif;
          }
          .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            backdrop-filter: blur(20px);
          }
          .icon { font-size: 48px; margin-bottom: 16px; }
          h2 { color: #4ade80; margin-bottom: 8px; }
          p { color: #94a3b8; margin-bottom: 24px; }
          a {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            padding: 12px 32px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h2>Kết nối YouTube thành công!</h2>
          <p>Tài khoản YouTube đã được liên kết. Bạn có thể bắt đầu upload video.</p>
          <a href="/">Quay lại Dashboard</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error(`YouTube OAuth failed: ${error.message}`);
    res.status(500).send(`OAuth failed: ${error.message}`);
  }
});

// ─── Disconnect YouTube ───
router.post('/youtube/disconnect', (req, res) => {
  try {
    youtubeUploader.disconnect();
    res.json({ success: true, message: 'YouTube disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
