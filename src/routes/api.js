const express = require('express');
const router = express.Router();
const Video = require('../models/video');
const jobQueue = require('../services/job-queue');
const youtubeUploader = require('../services/youtube-uploader');
const thumbnailGen = require('../services/thumbnail-generator');
const fs = require('fs');
const path = require('path');

// ─── Dashboard Stats ───
router.get('/stats', (req, res) => {
  try {
    const stats = Video.getStats();
    const queueStatus = jobQueue.getStatus();
    const youtubeConnected = youtubeUploader.isAuthenticated();
    const todayUploads = Video.getTodayUploadCount();
    const maxPerDay = parseInt(process.env.MAX_UPLOADS_PER_DAY || '5');

    res.json({
      success: true,
      data: {
        ...stats,
        queue: queueStatus,
        youtubeConnected,
        todayUploads,
        maxPerDay,
        geminiConfigured: !!process.env.GEMINI_API_KEY,
      },
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
    const status = req.query.status;

    let videos;
    if (status) {
      videos = Video.getByStatus(status);
    } else {
      videos = Video.getAll(limit, offset);
    }

    // Parse tags from JSON string
    videos = videos.map(v => ({
      ...v,
      tags: (() => { try { return JSON.parse(v.tags || '[]'); } catch { return []; } })(),
    }));

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

    video.tags = (() => { try { return JSON.parse(video.tags || '[]'); } catch { return []; } })();
    res.json({ success: true, data: video });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Add Douyin URLs (bulk) ───
router.post('/videos/add', (req, res) => {
  try {
    const { urls, autoProcess } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'Cần ít nhất 1 URL Douyin' });
    }

    const added = [];
    for (const url of urls) {
      const trimmed = url.trim();
      if (!trimmed) continue;

      // Extract URL from share text if needed
      const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
      const cleanUrl = urlMatch ? urlMatch[0] : trimmed;

      const video = Video.create({ douyin_url: cleanUrl });
      added.push(video);

      // Auto-process if requested
      if (autoProcess) {
        jobQueue.addJob({
          type: 'full-pipeline',
          videoId: video.id,
        });
      }
    }

    res.json({
      success: true,
      message: `Đã thêm ${added.length} video`,
      data: added,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Download a video ───
router.post('/videos/:id/download', (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });

    jobQueue.addJob({ type: 'download', videoId: video.id });
    res.json({ success: true, message: 'Đã thêm vào hàng đợi tải về' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Generate caption & thumbnail ───
router.post('/videos/:id/generate', (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });

    jobQueue.addJob({ type: 'generate', videoId: video.id });
    res.json({ success: true, message: 'Đã thêm vào hàng đợi tạo caption' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Upload to YouTube ───
router.post('/videos/:id/upload', (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });

    if (!youtubeUploader.isAuthenticated()) {
      return res.status(401).json({ success: false, error: 'Chưa kết nối YouTube. Vui lòng đăng nhập.' });
    }

    jobQueue.addJob({ type: 'upload', videoId: video.id });
    res.json({ success: true, message: 'Đã thêm vào hàng đợi upload' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Update video metadata ───
router.put('/videos/:id', (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });

    const allowedFields = ['title', 'description', 'tags', 'category'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'tags' && Array.isArray(req.body[field])
          ? JSON.stringify(req.body[field])
          : req.body[field];
      }
    }

    const updated = Video.update(req.params.id, updates);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Delete video ───
router.delete('/videos/:id', (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });

    // Delete files
    if (video.local_path && fs.existsSync(video.local_path)) {
      fs.unlinkSync(video.local_path);
    }
    if (video.thumbnail_path && fs.existsSync(video.thumbnail_path)) {
      fs.unlinkSync(video.thumbnail_path);
    }

    Video.delete(req.params.id);
    res.json({ success: true, message: 'Video đã được xoá' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Batch actions ───
router.post('/videos/batch', (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'Cần danh sách video IDs' });
    }

    const validActions = ['download', 'generate', 'upload', 'full-pipeline', 'delete'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, error: `Action không hợp lệ. Chọn: ${validActions.join(', ')}` });
    }

    if (action === 'delete') {
      for (const id of ids) {
        const video = Video.getById(id);
        if (video) {
          if (video.local_path && fs.existsSync(video.local_path)) fs.unlinkSync(video.local_path);
          if (video.thumbnail_path && fs.existsSync(video.thumbnail_path)) fs.unlinkSync(video.thumbnail_path);
          Video.delete(id);
        }
      }
      return res.json({ success: true, message: `Đã xoá ${ids.length} video` });
    }

    for (const id of ids) {
      jobQueue.addJob({ type: action, videoId: id });
    }

    res.json({ success: true, message: `Đã thêm ${ids.length} jobs vào hàng đợi` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Queue status ───
router.get('/queue', (req, res) => {
  res.json({ success: true, data: jobQueue.getStatus() });
});

// ─── Extract frames (for thumbnail selection) ───
router.get('/videos/:id/frames', async (req, res) => {
  try {
    const video = Video.getById(req.params.id);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found' });
    if (!video.local_path) return res.status(400).json({ success: false, error: 'Video chưa tải về' });

    const frames = await thumbnailGen.extractFrames(video.local_path, 8);
    const frameUrls = frames.map((f, i) => ({
      index: i,
      url: `/thumbnails/${path.basename(path.dirname(f))}/${path.basename(f)}`,
    }));

    res.json({ success: true, data: frameUrls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
