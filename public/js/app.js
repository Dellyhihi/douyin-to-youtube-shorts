/**
 * Douyin Video Downloader & Gallery Application
 */

let allVideos = [];
let currentPage = 'add';
let viewMode = 'grid';
let refreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  setupUrlInputListener();
  loadStats();
  loadGallery();
  startAutoRefresh();
});

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadStats(true);
    if (currentPage === 'gallery') loadGallery(true);
    if (currentPage === 'queue') loadQueue(true);
  }, 4000);
}

// ─── Navigation ───
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  document.querySelectorAll('.page-view').forEach(view => {
    view.classList.toggle('active', view.id === `page-${page}`);
  });

  if (page === 'gallery') loadGallery();
  if (page === 'queue') loadQueue();
  loadStats();
}

// ─── URL Counter ───
function setupUrlInputListener() {
  const textarea = document.getElementById('url-input');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    const urls = extractUrls(textarea.value);
    document.getElementById('url-count-num').textContent = urls.length;
  });
}

function extractUrls(text) {
  if (!text) return [];
  // Match any http/https URL anywhere in the string
  const urlMatches = [...text.matchAll(/https?:\/\/[^\s"'<>\u4e00-\u9fa5，,]+/gi)].map(m => m[0]);
  if (urlMatches.length > 0) {
    return Array.from(new Set(urlMatches.map(u => u.replace(/[.,!?;:)\]>]+$/, ''))));
  }
  // If user pasted without https (e.g. v.douyin.com/xxx)
  const noHttpMatches = [...text.matchAll(/(?:v\.douyin\.com|douyin\.com|tiktok\.com)\/[^\s"'<>\u4e00-\u9fa5，,]+/gi)].map(m => 'https://' + m[0]);
  if (noHttpMatches.length > 0) {
    return Array.from(new Set(noHttpMatches.map(u => u.replace(/[.,!?;:)\]>]+$/, ''))));
  }
  return [];
}

function clearUrlInput() {
  const input = document.getElementById('url-input');
  if (input) input.value = '';
  document.getElementById('url-count-num').textContent = '0';
}

// ─── Start Download ───
async function startBatchDownload() {
  const textarea = document.getElementById('url-input');
  const urls = extractUrls(textarea.value);

  if (urls.length === 0) {
    showToast('⚠️ Vui lòng dán ít nhất 1 đường link Douyin hoặc TikTok', 'warning');
    return;
  }

  const btn = document.getElementById('btn-start-download');
  btn.disabled = true;
  btn.innerHTML = '⏳ Đang khởi tạo...';

  try {
    const res = await API.addVideos(urls);
    showToast(`🚀 Đã thêm ${urls.length} video vào tiến trình tải không logo!`, 'success');
    clearUrlInput();
    
    // Switch to Queue or Gallery to monitor
    setTimeout(() => {
      switchPage('gallery');
    }, 1000);
  } catch (err) {
    showToast(`❌ Lỗi: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⚡ Tải Video Ngay (Xóa Logo)';
  }
}

// ─── Load Stats ───
async function loadStats(silent = false) {
  try {
    const res = await API.getStats();
    const data = res.data;

    document.getElementById('header-total-count').textContent = data.total || 0;
    document.getElementById('nav-badge').textContent = data.total || 0;
    document.getElementById('queue-badge').textContent = data.queue?.queueSize || 0;

    const totalBytes = (data.totalBytes || 0);
    document.getElementById('header-total-size').textContent = formatBytes(totalBytes);
  } catch (_) {}
}

// ─── Load Gallery ───
async function loadGallery(silent = false) {
  try {
    const res = await API.getVideos();
    allVideos = res.data || [];
    renderGallery(allVideos);
  } catch (err) {
    if (!silent) showToast(`❌ Lỗi tải bộ sưu tập: ${err.message}`, 'error');
  }
}

function filterGallery() {
  const query = (document.getElementById('gallery-search')?.value || '').toLowerCase().trim();
  if (!query) {
    renderGallery(allVideos);
    return;
  }

  const filtered = allVideos.filter(v => {
    const title = (v.title || v.original_caption || '').toLowerCase();
    const author = (v.author || '').toLowerCase();
    const url = (v.douyin_url || '').toLowerCase();
    return title.includes(query) || author.includes(query) || url.includes(query);
  });

  renderGallery(filtered);
}

function renderGallery(videos) {
  const gridContainer = document.getElementById('video-grid');
  const tableWrapper = document.getElementById('video-table-wrapper');
  const tableBody = document.getElementById('video-table-body');
  const emptyBox = document.getElementById('gallery-empty');

  if (!videos || videos.length === 0) {
    gridContainer.innerHTML = '';
    tableBody.innerHTML = '';
    gridContainer.style.display = 'none';
    tableWrapper.style.display = 'none';
    emptyBox.style.display = 'block';
    return;
  }

  emptyBox.style.display = 'none';

  if (viewMode === 'grid') {
    gridContainer.style.display = 'grid';
    tableWrapper.style.display = 'none';
    gridContainer.innerHTML = videos.map(v => renderGridCard(v)).join('');
  } else {
    gridContainer.style.display = 'none';
    tableWrapper.style.display = 'block';
    tableBody.innerHTML = videos.map((v, i) => renderTableRow(v, i)).join('');
  }
}

function renderGridCard(v) {
  const isLocal = v.local_path;
  const fileName = v.local_path ? v.local_path.split(/[/\\\\]/).pop() : `douyin_${v.id}.mp4`;
  const videoUrl = isLocal ? `/downloads/${fileName}` : `/api/videos/${v.id}/stream`;
  const downloadUrl = isLocal ? `/downloads/${fileName}` : `/api/videos/${v.id}/stream?download=1`;
  const displayTitle = v.title || v.original_caption || 'Video Douyin không logo';
  const durationStr = formatDuration(v.duration || 0);
  const sizeStr = v.file_size ? formatBytes(v.file_size) : (v.duration ? `${v.duration}s` : 'HD');
  const dateStr = formatDate(v.created_at);

  const statusText = v.status === 'failed' ? '❌ Thất bại' : '✅ Đã xóa logo';

  return `
  <div class="video-card" data-id="${v.id}">
    <div class="card-media" onclick="openVideoPlayer(${v.id})">
      ${v.cover_url ? `<img src="${v.cover_url}" alt="Cover" loading="lazy">` : (videoUrl ? `<video src="${videoUrl}#t=0.5" preload="metadata"></video>` : `<div style="background:#1e293b;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:32px;">🎬</div>`)}
      
      <div class="play-overlay">
        <div class="play-badge-icon">▶</div>
      </div>

      <span class="card-badge-status">${statusText}</span>
      ${v.duration ? `<span class="card-badge-duration">${durationStr}</span>` : ''}
    </div>

    <div class="card-content">
      <h4 class="card-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</h4>
      <div class="card-author">👤 ${escapeHtml(v.author || 'Douyin Creator')}</div>

      <div class="card-meta-row">
        <span>📦 ${sizeStr}</span>
        <span>🕒 ${dateStr}</span>
      </div>

      <div class="card-actions">
        <button class="btn btn-primary btn-sm" onclick="openVideoPlayer(${v.id})">▶️ Xem</button>
        <a href="${downloadUrl}" download="${fileName}" class="btn btn-secondary btn-sm" title="Lưu MP4 về máy">💾 Lưu</a>
        <button class="btn btn-ghost btn-sm" onclick="deleteVideoItem(${v.id})" title="Xoá video">🗑️</button>
      </div>
    </div>
  </div>
  `;
}

function renderTableRow(v, i) {
  const isLocal = v.local_path;
  const fileName = v.local_path ? v.local_path.split(/[/\\\\]/).pop() : `douyin_${v.id}.mp4`;
  const videoUrl = isLocal ? `/downloads/${fileName}` : `/api/videos/${v.id}/stream`;
  const downloadUrl = isLocal ? `/downloads/${fileName}` : `/api/videos/${v.id}/stream?download=1`;
  const displayTitle = v.title || v.original_caption || 'Video Douyin không logo';

  return `
  <tr>
    <td style="color:var(--text-muted);">${i + 1}</td>
    <td style="max-width:320px; font-weight:600;">
      <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(displayTitle)}">
        ${escapeHtml(displayTitle)}
      </div>
      <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(v.douyin_url)}</div>
    </td>
    <td>${escapeHtml(v.author || 'Douyin Creator')}</td>
    <td>${v.file_size ? formatBytes(v.file_size) : 'HD'}</td>
    <td>${formatDuration(v.duration || 0)}</td>
    <td style="color:var(--text-muted); font-size:12px;">${formatDate(v.created_at)}</td>
    <td>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-primary btn-sm" onclick="openVideoPlayer(${v.id})">▶️ Xem</button>
        <a href="${downloadUrl}" download="${fileName}" class="btn btn-secondary btn-sm">💾 Lưu</a>
        <button class="btn btn-ghost btn-sm" onclick="deleteVideoItem(${v.id})">🗑️</button>
      </div>
    </td>
  </tr>
  `;
}

function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('btn-view-grid').classList.toggle('active', mode === 'grid');
  document.getElementById('btn-view-table').classList.toggle('active', mode === 'table');
  renderGallery(allVideos);
}

// ─── Video Modal Player ───
function openVideoPlayer(id) {
  const video = allVideos.find(v => v.id === id);
  if (!video) return;

  const isLocal = video.local_path;
  const fileName = video.local_path ? video.local_path.split(/[/\\\\]/).pop() : `douyin_${video.id}.mp4`;
  const videoUrl = isLocal ? `/downloads/${fileName}` : `/api/videos/${video.id}/stream`;
  const downloadUrl = isLocal ? `/downloads/${fileName}` : `/api/videos/${video.id}/stream?download=1`;
  const displayTitle = video.title || video.original_caption || 'Video Douyin không logo';

  const modal = document.getElementById('video-modal');
  const player = document.getElementById('modal-player');
  const downloadBtn = document.getElementById('modal-download-btn');

  document.getElementById('modal-video-title').textContent = `🎬 ${displayTitle}`;
  document.getElementById('modal-author').textContent = video.author || 'Douyin Creator';
  document.getElementById('modal-size').textContent = video.file_size ? formatBytes(video.file_size) : '1080p HD';
  document.getElementById('modal-duration').textContent = formatDuration(video.duration || 0);
  document.getElementById('modal-caption').textContent = video.original_caption || displayTitle;

  player.src = videoUrl;
  downloadBtn.href = downloadUrl;
  downloadBtn.setAttribute('download', fileName);

  modal.classList.add('active');
  player.play().catch(() => {});
}

function closeVideoModal() {
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('modal-player');
  if (player) {
    player.pause();
    player.src = '';
  }
  if (modal) modal.classList.remove('active');
}

function onBackdropClick(e) {
  if (e.target.id === 'video-modal') {
    closeVideoModal();
  }
}

// ─── Delete Video ───
async function deleteVideoItem(id) {
  if (!confirm('Bạn có chắc muốn xoá video này khỏi bộ sưu tập?')) return;

  try {
    await API.deleteVideo(id);
    showToast('🗑️ Đã xoá video khỏi bộ sưu tập', 'info');
    loadGallery();
    loadStats();
  } catch (err) {
    showToast(`❌ Lỗi xoá: ${err.message}`, 'error');
  }
}

// ─── Queue Progress ───
async function loadQueue() {
  try {
    const res = await API.getQueue();
    const q = res.data;
    const container = document.getElementById('queue-list');

    if (!q || (!q.processing && (!q.pendingJobs || q.pendingJobs.length === 0))) {
      container.innerHTML = `
        <div class="empty-box" style="padding: 30px;">
          <div class="empty-icon">😴</div>
          <h3>Không có video nào đang chờ tải</h3>
          <p>Tất cả video đã được tải hoàn tất về bộ sưu tập!</p>
        </div>
      `;
      return;
    }

    let html = '';
    if (q.currentJob) {
      html += `
        <div class="queue-item" style="border-color: var(--accent-primary); background: rgba(99,102,241,0.06);">
          <div>
            <strong>⏳ Đang tải video #${q.currentJob.videoId}...</strong>
            <div style="font-size:12px; color:var(--text-muted);">Đang bóc tách và tải file video không watermark</div>
          </div>
          <span class="card-badge-status" style="position:static;">Đang tải</span>
        </div>
      `;
    }

    if (q.pendingJobs && q.pendingJobs.length > 0) {
      html += q.pendingJobs.map((job, idx) => `
        <div class="queue-item">
          <div>
            <strong>#${idx + 1}. Video #${job.videoId}</strong>
            <div style="font-size:12px; color:var(--text-muted);">Đang xếp hàng chờ tải</div>
          </div>
          <span style="font-size:12px; color:var(--text-muted);">Đang chờ</span>
        </div>
      `).join('');
    }

    container.innerHTML = html;
  } catch (_) {}
}

// ─── Toast Notifications ───
function showToast(msg, type = 'info') {
  const stack = document.getElementById('toast-stack');
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = msg;

  stack.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// ─── Helpers ───
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
