const logger = require('../utils/logger');
const Video = require('../models/video');
const douyinDownloader = require('./douyin-downloader');
const aiCaption = require('./ai-caption');
const thumbnailGenerator = require('./thumbnail-generator');
const youtubeUploader = require('./youtube-uploader');

/**
 * Simple in-memory job queue
 * Processes jobs one at a time to avoid API rate limits
 */
class JobQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.currentJob = null;
  }

  /**
   * Add a job to the queue
   */
  addJob(job) {
    this.queue.push(job);
    logger.info(`Job added to queue. Queue size: ${this.queue.length}`);
    this.processNext();
    return job;
  }

  /**
   * Process next job in queue
   */
  async processNext() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    this.currentJob = this.queue.shift();

    try {
      logger.info(`Processing job: ${this.currentJob.type} for video ${this.currentJob.videoId}`);

      switch (this.currentJob.type) {
        case 'download':
          await this.handleDownload(this.currentJob.videoId);
          break;
        case 'generate':
          await this.handleGenerate(this.currentJob.videoId);
          break;
        case 'upload':
          await this.handleUpload(this.currentJob.videoId);
          break;
        case 'full-pipeline':
          await this.handleFullPipeline(this.currentJob.videoId);
          break;
      }
    } catch (error) {
      logger.error(`Job failed: ${error.message}`);
      try {
        Video.update(this.currentJob.videoId, {
          status: 'failed',
          error_message: error.message,
        });
      } catch (e) {
        logger.error(`Failed to update video status: ${e.message}`);
      }
    } finally {
      this.processing = false;
      this.currentJob = null;
      // Process next job after a short delay
      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), 2000);
      }
    }
  }

  /**
   * Download a Douyin video
   */
  async handleDownload(videoId) {
    const video = Video.getById(videoId);
    if (!video) throw new Error(`Video ${videoId} not found`);

    Video.update(videoId, { status: 'downloading' });

    Video.update(videoId, {
      status: 'downloaded',
      douyin_id: result.id,
      author: result.author || 'Douyin Creator',
      original_caption: result.caption,
      title: result.caption || 'Video Douyin không logo',
      local_path: result.localPath,
      file_size: result.fileSize,
      duration: result.duration,
      width: result.width,
      height: result.height,
    });

    logger.success(`Video ${videoId} downloaded successfully (No Watermark)`);
  }

  /**
   * Generate AI caption and thumbnail
   */
  async handleGenerate(videoId) {
    const video = Video.getById(videoId);
    if (!video) throw new Error(`Video ${videoId} not found`);
    if (!video.local_path) throw new Error('Video chưa được tải về');

    Video.update(videoId, { status: 'generating' });

    // Generate AI caption
    let captionResult;
    try {
      // Try video-based caption first (best quality)
      captionResult = await aiCaption.generateCaption(video.local_path, {
        originalCaption: video.original_caption,
      });
    } catch (error) {
      logger.warn(`Video caption failed, trying text-only: ${error.message}`);
      // Fallback to text-based caption
      if (video.original_caption) {
        captionResult = await aiCaption.generateCaptionFromText(video.original_caption);
      } else {
        captionResult = {
          title: `Amazing Video #Shorts`,
          description: 'Check out this amazing video! #Shorts',
          tags: ['shorts', 'viral', 'trending'],
          category: 'Entertainment',
        };
      }
    }

    // Generate thumbnail
    let thumbnailPath = null;
    try {
      thumbnailPath = await thumbnailGenerator.generateThumbnail(video.local_path);
    } catch (error) {
      logger.warn(`Thumbnail generation failed: ${error.message}`);
    }

    Video.update(videoId, {
      status: 'ready',
      title: captionResult.title,
      description: captionResult.description,
      tags: captionResult.tags || [],
      category: captionResult.category || 'Entertainment',
      thumbnail_path: thumbnailPath,
    });

    logger.success(`Video ${videoId} caption & thumbnail generated`);
  }

  /**
   * Upload video to YouTube
   */
  async handleUpload(videoId) {
    const video = Video.getById(videoId);
    if (!video) throw new Error(`Video ${videoId} not found`);
    if (!video.local_path) throw new Error('Video chưa được tải về');

    // Check daily quota
    const todayCount = Video.getTodayUploadCount();
    const maxPerDay = parseInt(process.env.MAX_UPLOADS_PER_DAY || '5');
    if (todayCount >= maxPerDay) {
      throw new Error(`Đã đạt giới hạn upload hôm nay (${maxPerDay} video/ngày). Thử lại ngày mai.`);
    }

    Video.update(videoId, { status: 'uploading' });

    const tags = Array.isArray(video.tags) ? video.tags : (() => {
      try { return JSON.parse(video.tags || '[]'); } catch { return []; }
    })();

    const result = await youtubeUploader.uploadVideo(video.local_path, {
      title: video.title || 'Untitled #Shorts',
      description: video.description || '',
      tags: tags,
      category: video.category || 'Entertainment',
    });

    // Set custom thumbnail if available
    if (video.thumbnail_path) {
      await youtubeUploader.setThumbnail(result.videoId, video.thumbnail_path);
    }

    Video.update(videoId, {
      status: 'uploaded',
      youtube_id: result.videoId,
      youtube_url: result.videoUrl,
    });

    logger.success(`Video ${videoId} uploaded to YouTube: ${result.videoUrl}`);
  }

  /**
   * Pipeline: Tải video không logo và lưu vào bộ sưu tập
   */
  async handleFullPipeline(videoId) {
    await this.handleDownload(videoId);
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      currentJob: this.currentJob ? {
        type: this.currentJob.type,
        videoId: this.currentJob.videoId,
      } : null,
      pendingJobs: this.queue.map(j => ({
        type: j.type,
        videoId: j.videoId,
      })),
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    logger.info('Job queue cleared');
  }
}

// Singleton instance
const jobQueue = new JobQueue();

module.exports = jobQueue;
