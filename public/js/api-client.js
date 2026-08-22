/**
 * API Client - Handles all HTTP requests to the backend
 */
const API = {
  baseUrl: '',

  async request(method, path, data = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) options.body = JSON.stringify(data);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, options);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Có lỗi xảy ra');
      }

      return result;
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        throw new Error('Không thể kết nối server. Hãy kiểm tra server đang chạy.');
      }
      throw error;
    }
  },

  // ─── Stats ───
  getStats() {
    return this.request('GET', '/api/stats');
  },

  // ─── Videos ───
  getVideos(status = '') {
    const query = status ? `?status=${status}` : '';
    return this.request('GET', `/api/videos${query}`);
  },

  getVideo(id) {
    return this.request('GET', `/api/videos/${id}`);
  },

  addVideos(urls, autoProcess = true) {
    return this.request('POST', '/api/videos/add', { urls, autoProcess });
  },

  updateVideo(id, data) {
    return this.request('PUT', `/api/videos/${id}`, data);
  },

  deleteVideo(id) {
    return this.request('DELETE', `/api/videos/${id}`);
  },

  // ─── Actions ───
  downloadVideo(id) {
    return this.request('POST', `/api/videos/${id}/download`);
  },

  generateCaption(id) {
    return this.request('POST', `/api/videos/${id}/generate`);
  },

  uploadVideo(id) {
    return this.request('POST', `/api/videos/${id}/upload`);
  },

  batchAction(ids, action) {
    return this.request('POST', '/api/videos/batch', { ids, action });
  },

  // ─── Queue ───
  getQueue() {
    return this.request('GET', '/api/queue');
  },

  // ─── Frames ───
  getFrames(id) {
    return this.request('GET', `/api/videos/${id}/frames`);
  },

  // ─── YouTube Auth ───
  getYouTubeStatus() {
    return this.request('GET', '/auth/youtube/status');
  },

  disconnectYouTube() {
    return this.request('POST', '/auth/youtube/disconnect');
  },
};
