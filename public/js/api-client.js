/**
 * API Client - Douyin Video Downloader & Gallery
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
        throw new Error('Không thể kết nối máy chủ. Hãy kiểm tra server đang chạy.');
      }
      throw error;
    }
  },

  getStats() {
    return this.request('GET', '/api/stats');
  },

  getVideos() {
    return this.request('GET', '/api/videos');
  },

  getVideo(id) {
    return this.request('GET', `/api/videos/${id}`);
  },

  addVideos(urls) {
    return this.request('POST', '/api/videos/add', { urls, autoProcess: true });
  },

  deleteVideo(id) {
    return this.request('DELETE', `/api/videos/${id}`);
  },

  getQueue() {
    return this.request('GET', '/api/queue');
  },
};
