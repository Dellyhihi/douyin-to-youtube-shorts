const fs = require('fs');
const path = require('path');
const os = require('os');

// On serverless platforms like Vercel, the filesystem is read-only except os.tmpdir()
const isServerless = !!process.env.VERCEL;
const DATA_DIR = isServerless
  ? path.join(os.tmpdir(), 'douyin-app-data')
  : path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'videos.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create DATA_DIR:', e.message);
}

/**
 * Simple JSON file-based database
 * Provides SQLite-like API without native compilation requirements
 */
class JsonDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('DB load error, resetting:', e.message);
    }
    // Default structure
    return {
      videos: [],
      settings: {},
      nextId: 1,
    };
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to persist database file:', e.message);
    }
  }

  // ─── Video CRUD ───

  insertVideo(video) {
    const now = new Date().toISOString();
    const record = {
      id: this.data.nextId++,
      douyin_url: video.douyin_url,
      douyin_id: video.douyin_id || null,
      original_caption: video.original_caption || null,
      local_path: null,
      thumbnail_path: null,
      title: null,
      description: null,
      tags: [],
      category: 'Entertainment',
      youtube_id: null,
      youtube_url: null,
      status: 'pending',
      error_message: null,
      duration: null,
      file_size: null,
      width: null,
      height: null,
      created_at: now,
      updated_at: now,
    };
    this.data.videos.push(record);
    this._save();
    return { ...record };
  }

  getVideoById(id) {
    const v = this.data.videos.find(v => v.id === id);
    return v ? { ...v } : null;
  }

  getAllVideos(limit = 100, offset = 0) {
    return this.data.videos
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit)
      .map(v => ({ ...v }));
  }

  getVideosByStatus(status) {
    return this.data.videos
      .filter(v => v.status === status)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(v => ({ ...v }));
  }

  updateVideo(id, updates) {
    const index = this.data.videos.findIndex(v => v.id === id);
    if (index === -1) return null;

    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'created_at') continue;
      this.data.videos[index][key] = value;
    }
    this.data.videos[index].updated_at = now;
    this._save();
    return { ...this.data.videos[index] };
  }

  deleteVideo(id) {
    const index = this.data.videos.findIndex(v => v.id === id);
    if (index === -1) return false;
    this.data.videos.splice(index, 1);
    this._save();
    return true;
  }

  getStats() {
    const videos = this.data.videos;
    const count = (status) => videos.filter(v => v.status === status).length;
    return {
      total: videos.length,
      pending: count('pending'),
      downloading: count('downloading'),
      downloaded: count('downloaded'),
      generating: count('generating'),
      ready: count('ready'),
      uploading: count('uploading'),
      uploaded: count('uploaded'),
      failed: count('failed'),
    };
  }

  getTodayUploadCount() {
    const today = new Date().toISOString().split('T')[0];
    return this.data.videos.filter(
      v => v.status === 'uploaded' && v.updated_at && v.updated_at.startsWith(today)
    ).length;
  }

  // ─── Settings ───

  getSetting(key) {
    return this.data.settings[key] || null;
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this._save();
  }
}

const db = new JsonDB(DB_PATH);

module.exports = db;
