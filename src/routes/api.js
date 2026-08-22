const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Video = require('../models/video');
const { extractCleanUrl, getVideoInfo } = require('../services/douyin-downloader');
const logger = require('../utils/logger');

// ─── Dashboard Stats ───
router.get('/stats', (req, res) => {
  try {
    const stats = Video.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Get all videos ───
router.get('/videos', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const videos = Video.getAll(limit, offset);
    res.json({ success: true, data: videos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Get single video ───
router.get('/videos/:id', (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });
    res.json({ success: true, data: video });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Add Douyin URLs (Synchronous processing - 100% Vercel & Serverless compatible) ───
router.post('/videos/add', async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'Cần ít nhất 1 URL Douyin' });
    }

    const added = [];
    for (const rawUrl of urls) {
      const cleanUrl = extractCleanUrl(rawUrl.trim());
      if (!cleanUrl || !cleanUrl.startsWith('http')) {
        logger.warn(`Skipping invalid URL: ${rawUrl}`);
        continue;
      }

      try {
        logger.info(`Extracting video metadata for: ${cleanUrl}`);
        const info = await getVideoInfo(cleanUrl);

        const video = Video.create({
          douyin_url: cleanUrl,
          douyin_id: info.id,
          author: info.author || 'Douyin Creator',
          title: info.caption || 'Video Douyin không logo',
          original_caption: info.caption,
          video_url: info.hdVideoUrl || info.videoUrl,
          cover_url: info.coverUrl,
          duration: info.duration || 0,
          width: info.width || 1080,
          height: info.height || 1920,
          status: 'downloaded',
        });

        added.push(video);
        logger.success(`Added video to collection: ${video.title} by ${video.author}`);
      } catch (err) {
        logger.error(`Error resolving video ${cleanUrl}: ${err.message}`);
        const video = Video.create({
          douyin_url: cleanUrl,
          status: 'failed',
          error_message: err.message,
        });
        added.push(video);
      }
    }

    const successCount = added.filter(v => v.status === 'downloaded').length;
    res.json({
      success: true,
      message: `Đã thêm ${successCount} video không logo vào bộ sưu tập`,
      data: added,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Stream / Download Clean MP4 (Works on both Local & Vercel) ───
router.get('/videos/:id/stream', async (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });

    // Local file fallback if exists
    if (video.local_path && fs.existsSync(video.local_path)) {
      if (req.query.download === '1') {
        return res.download(video.local_path);
      }
      return res.sendFile(video.local_path);
    }

    // Direct stream from clean ByteDance CDN
    let streamUrl = video.video_url;
    if (!streamUrl) {
      const info = await getVideoInfo(video.douyin_url);
      streamUrl = info.hdVideoUrl || info.videoUrl;
    }

    if (!streamUrl) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đường dẫn video' });
    }

    const safeName = (video.title || `douyin_${video.id}`).replace(/[^\w\u4e00-\u9fa5\u00C0-\u1EF9]/g, '_').substring(0, 50);
    const filename = `${safeName || 'video'}.mp4`;

    const videoStream = await axios.get(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.douyin.com/',
        'Range': req.headers.range || 'bytes=0-',
      },
      responseType: 'stream',
      timeout: 60000,
    });

    res.setHeader('Content-Type', videoStream.headers['content-type'] || 'video/mp4');
    if (videoStream.headers['content-length']) {
      res.setHeader('Content-Length', videoStream.headers['content-length']);
    }
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }

    videoStream.data.pipe(res);
  } catch (error) {
    logger.error(`Stream error for video ${req.params.id}: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Delete video ───
router.delete('/videos/:id', (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });

    if (video.local_path && fs.existsSync(video.local_path)) {
      try { fs.unlinkSync(video.local_path); } catch (_) {}
    }

    Video.delete(req.params.id);
    res.json({ success: true, message: 'Đã xoá video khỏi bộ sưu tập' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Queue status (for UI compatibility) ───
router.get('/queue', (req, res) => {
  res.json({
    success: true,
    data: {
      queueSize: 0,
      processing: false,
      currentJob: null,
      pendingJobs: [],
    },
  });
});

module.exports = router;
