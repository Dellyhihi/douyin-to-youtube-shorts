const db = require('../config/database');

const Video = {
  create(data) {
    return db.insertVideo(data);
  },

  getById(id) {
    return db.getVideoById(parseInt(id));
  },

  getAll(limit = 100, offset = 0) {
    return db.getAllVideos(limit, offset);
  },

  getByStatus(status) {
    return db.getVideosByStatus(status);
  },

  getStats() {
    return db.getStats();
  },

  update(id, data) {
    return db.updateVideo(parseInt(id), data);
  },

  delete(id) {
    return db.deleteVideo(parseInt(id));
  },

  getTodayUploadCount() {
    return db.getTodayUploadCount();
  },
};

module.exports = Video;
