const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { THUMBNAILS_DIR } = require('../utils/helpers');

/**
 * Check if ffmpeg is available on the system
 */
function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get video metadata using ffprobe
 */
function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;

    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        // If ffprobe is not available, return basic info
        logger.warn('ffprobe not available, using basic info');
        const stats = fs.statSync(filePath);
        resolve({
          duration: 0,
          width: 0,
          height: 0,
          bitrate: 0,
          size: stats.size,
          codec: 'unknown',
        });
        return;
      }

      try {
        const metadata = JSON.parse(stdout);
        const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
        resolve({
          duration: parseFloat(metadata.format?.duration || 0),
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          bitrate: parseInt(metadata.format?.bit_rate || 0),
          size: parseInt(metadata.format?.size || 0),
          codec: videoStream?.codec_name || 'unknown',
        });
      } catch (parseErr) {
        resolve({
          duration: 0, width: 0, height: 0,
          bitrate: 0, size: 0, codec: 'unknown',
        });
      }
    });
  });
}

/**
 * Extract frames from video at evenly spaced intervals
 */
async function extractFrames(filePath, count = 8) {
  const hasFfmpeg = checkFfmpeg();
  if (!hasFfmpeg) {
    logger.warn('ffmpeg not found. Thumbnail generation skipped.');
    return [];
  }

  const info = await getVideoInfo(filePath);
  const duration = info.duration;

  if (duration <= 0) {
    logger.warn('Could not determine video duration');
    return [];
  }

  const videoBasename = path.basename(filePath, path.extname(filePath));
  const frameDir = path.join(THUMBNAILS_DIR, videoBasename);

  if (!fs.existsSync(frameDir)) {
    fs.mkdirSync(frameDir, { recursive: true });
  }

  const frames = [];

  for (let i = 0; i < count; i++) {
    const seekTime = (duration / (count + 1)) * (i + 1);
    const outputFile = path.join(frameDir, `frame_${i}.jpg`);

    try {
      const cmd = `ffmpeg -y -ss ${seekTime} -i "${filePath}" -frames:v 1 -q:v 2 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black" "${outputFile}"`;
      execSync(cmd, { stdio: 'pipe', timeout: 15000 });

      if (fs.existsSync(outputFile)) {
        frames.push(outputFile);
        logger.info(`Extracted frame ${frames.length}/${count}`);
      }
    } catch (err) {
      logger.warn(`Frame ${i} extraction failed: ${err.message}`);
    }
  }

  return frames;
}

/**
 * Generate a thumbnail from the best frame of the video
 */
async function generateThumbnail(filePath, options = {}) {
  const hasFfmpeg = checkFfmpeg();
  if (!hasFfmpeg) {
    logger.warn('ffmpeg not installed. Thumbnail generation skipped.');
    logger.warn('Install ffmpeg: https://ffmpeg.org/download.html');
    return null;
  }

  const info = await getVideoInfo(filePath);
  const duration = info.duration;
  const seekTime = options.timestamp || duration * 0.35; // 35% into video

  const videoBasename = path.basename(filePath, path.extname(filePath));
  const thumbnailFile = path.join(THUMBNAILS_DIR, `thumb_${videoBasename}.jpg`);

  try {
    // Enhanced filter: brightness, contrast, saturation boost + sharpening
    const filters = [
      'scale=1280:720:force_original_aspect_ratio=decrease',
      'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
      'eq=brightness=0.06:contrast=1.15:saturation=1.2',
      'unsharp=5:5:0.8:5:5:0.4',
    ].join(',');

    const cmd = `ffmpeg -y -ss ${seekTime} -i "${filePath}" -frames:v 1 -q:v 1 -vf "${filters}" "${thumbnailFile}"`;
    execSync(cmd, { stdio: 'pipe', timeout: 15000 });

    if (fs.existsSync(thumbnailFile)) {
      logger.success(`Thumbnail created: ${thumbnailFile}`);
      return thumbnailFile;
    }
  } catch (err) {
    logger.error(`Thumbnail generation failed: ${err.message}`);
  }

  return null;
}

module.exports = {
  checkFfmpeg,
  getVideoInfo,
  extractFrames,
  generateThumbnail,
};
