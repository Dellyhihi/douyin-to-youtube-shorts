/**
 * Main Application Logic
 * Douyin → YouTube Shorts Tool
 */

// ─── State ───
let currentPage = 'dashboard';
let selectedVideos = new Set();
let editingVideoId = null;
let refreshInterval = null;

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  setupUrlCounter();
  startAutoRefresh();
});

// ─── Auto Refresh (every 5s) ───
function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    if (currentPage === 'dashboard') {
      loadStats();
      loadRecentVideos();
    } else if (currentPage === 'videos') {
      loadVideos();
    } else if (currentPage === 'queue') {
      refreshQueue();
    }
  }, 5000);
}

// ─── Page Navigation ───
function switchPage(page) {
  currentPage = page;

  // Update nav tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === page);
  });

  // Show/hide pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });

  // Load page data
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'videos': loadVideos(); break;
    case 'queue': refreshQueue(); break;
    case 'settings': loadSettings(); break;
  }
}

function showSettings() {
  switchPage('settings');
}

// ─── Dashboard ───
async function loadDashboard() {
  await loadStats();
  await loadRecentVideos();
}

async function loadStats() {
  try {
    const result = await API.getStats();
    const d = result.data;

    document.getElementById('stat-total').textContent = d.total;
    document.getElementById('stat-pending').textContent = d.pending + d.downloading;
    document.getElementById('stat-ready').textContent = d.ready;
    document.getElementById('stat-uploaded').textContent = d.uploaded;
    document.getElementById('stat-failed').textContent = d.failed;
    document.getElementById('stat-today-uploads').textContent = d.todayUploads;
    document.getElementById('stat-max-uploads').textContent = d.maxPerDay;
    document.getElementById('total-badge').textContent = d.total;
    document.getElementById('queue-badge').textContent = d.queue.queueSize + (d.queue.processing ? 1 : 0);

    // Update config badges
    const geminiBadge = document.getElementById('gemini-badge');
    if (d.geminiConfigured) {
      geminiBadge.className = 'config-badge ok';
      geminiBadge.textContent = '✅ Gemini';
    } else {
      geminiBadge.className = 'config-badge warn';
      geminiBadge.textContent = '⚠️ Gemini';
    }

    const ytBadge = document.getElementById('youtube-badge');
    if (d.youtubeConnected) {
      ytBadge.className = 'config-badge ok';
      ytBadge.textContent = '✅ YouTube';
    } else {
      ytBadge.className = 'config-badge warn';
      ytBadge.textContent = '⚠️ YouTube';
    }
  } catch (err) {
    // Silently fail on stats refresh
  }
}

async function loadRecentVideos() {
  try {
    const result = await API.getVideos();
    const videos = result.data.slice(0, 5);

    const container = document.getElementById('recent-videos-container');
    if (videos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">Chưa có video nào</div>
          <div class="empty-desc">Bắt đầu bằng cách thêm link video Douyin</div>
          <button class="btn btn-primary" onclick="switchPage('add')">➕ Thêm video</button>
        </div>`;
      return;
    }

    container.innerHTML = `
      <table class="video-table">
        <thead>
          <tr>
            <th>#</th>
            <th>URL / Caption</th>
            <th>Trạng thái</th>
            <th>Thời gian</th>
          </tr>
        </thead>
        <tbody>
          ${videos.map((v, i) => `
            <tr>
              <td>${v.id}</td>
              <td class="video-title-cell">
                <div class="video-title-text">${escapeHtml(v.title || v.original_caption || 'Chưa có caption')}</div>
                <div class="video-url-text">${escapeHtml(v.douyin_url)}</div>
              </td>
              <td>${statusBadge(v.status)}</td>
              <td style="font-size: 12px; color: var(--text-muted);">${formatDate(v.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    // Silently fail
  }
}

// ─── Add Videos ───
function setupUrlCounter() {
  const input = document.getElementById('url-input');
  if (!input) return;
  input.addEventListener('input', () => {
    const urls = extractUrls(input.value);
    document.getElementById('url-count-num').textContent = urls.length;
  });
}

function extractUrls(text) {
  const lines = text.split('\n');
  const urls = [];
  for (const line of lines) {
    const match = line.match(/https?:\/\/[^\s]+/);
    if (match) urls.push(match[0]);
  }
  return urls;
}

function clearUrlInput() {
  document.getElementById('url-input').value = '';
  document.getElementById('url-count-num').textContent = '0';
}

async function addVideos() {
  const input = document.getElementById('url-input');
  const urls = extractUrls(input.value);

  if (urls.length === 0) {
    showToast('Không tìm thấy link Douyin nào', 'warning');
    return;
  }

  const autoProcess = document.getElementById('auto-process-checkbox').checked;
  const btn = document.getElementById('add-btn');

  btn.disabled = true;
  btn.textContent = '⏳ Đang xử lý...';

  try {
    const result = await API.addVideos(urls, autoProcess);
    showToast(`✅ ${result.message}`, 'success');
    clearUrlInput();
    loadStats();
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Thêm & Tải';
  }
}

// ─── Videos List ───
async function loadVideos() {
  try {
    const status = document.getElementById('filter-status')?.value || '';
    const result = await API.getVideos(status);
    const videos = result.data;

    const tbody = document.getElementById('video-tbody');

    if (videos.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state" style="padding: 40px;">
              <div class="empty-icon">🔍</div>
              <div class="empty-title">Không có video nào</div>
            </div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = videos.map(v => `
      <tr data-id="${v.id}">
        <td><input type="checkbox" class="checkbox video-select" value="${v.id}" onchange="updateSelection()"></td>
        <td style="font-size: 12px; color: var(--text-muted);">${v.id}</td>
        <td class="video-title-cell">
          <div class="video-title-text">${escapeHtml(v.title || v.original_caption || 'Chưa có tiêu đề')}</div>
          <div class="video-url-text">${escapeHtml(v.douyin_url)}</div>
        </td>
        <td>${statusBadge(v.status)}</td>
        <td style="max-width: 200px;">
          <div style="font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${v.title ? '✅ Có caption' : '—'}
          </div>
        </td>
        <td>
          ${v.youtube_url
            ? `<a href="${v.youtube_url}" target="_blank" class="yt-link">🔗 ${v.youtube_id}</a>`
            : '<span style="color: var(--text-muted); font-size: 12px;">—</span>'}
        </td>
        <td>
          <div class="action-group">
            ${v.status === 'pending' ? `<button class="btn btn-secondary btn-sm" onclick="actionDownload(${v.id})" title="Tải về">⬇️</button>` : ''}
            ${v.status === 'downloaded' ? `<button class="btn btn-secondary btn-sm" onclick="actionGenerate(${v.id})" title="Tạo caption">🤖</button>` : ''}
            ${v.status === 'ready' ? `<button class="btn btn-success btn-sm" onclick="actionUpload(${v.id})" title="Upload">📤</button>` : ''}
            ${['downloaded', 'ready', 'failed'].includes(v.status) ? `<button class="btn btn-secondary btn-sm" onclick="openEdit(${v.id})" title="Chỉnh sửa">✏️</button>` : ''}
            ${v.status === 'failed' ? `<button class="btn btn-secondary btn-sm" onclick="retryVideo(${v.id})" title="Thử lại">🔄</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="actionDelete(${v.id})" title="Xoá">🗑️</button>
          </div>
          ${v.error_message ? `<div style="font-size: 11px; color: var(--status-failed); margin-top: 4px;">${escapeHtml(v.error_message.substring(0, 80))}</div>` : ''}
        </td>
      </tr>
    `).join('');

    updateBatchBar();
  } catch (err) {
    showToast(`❌ Lỗi tải danh sách: ${err.message}`, 'error');
  }
}

// ─── Video Actions ───
async function actionDownload(id) {
  try {
    await API.downloadVideo(id);
    showToast('⬇️ Đã thêm vào hàng đợi tải', 'info');
    loadVideos();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

async function actionGenerate(id) {
  try {
    await API.generateCaption(id);
    showToast('🤖 Đang tạo caption...', 'info');
    loadVideos();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

async function actionUpload(id) {
  try {
    await API.uploadVideo(id);
    showToast('📤 Đang upload lên YouTube...', 'info');
    loadVideos();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

async function actionDelete(id) {
  if (!confirm('Bạn chắc chắn muốn xoá video này?')) return;
  try {
    await API.deleteVideo(id);
    showToast('🗑️ Đã xoá video', 'success');
    loadVideos();
    loadStats();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

async function retryVideo(id) {
  try {
    const video = (await API.getVideo(id)).data;
    if (!video.local_path) {
      await API.downloadVideo(id);
      showToast('🔄 Đang thử tải lại...', 'info');
    } else if (!video.title) {
      await API.generateCaption(id);
      showToast('🔄 Đang thử tạo caption lại...', 'info');
    } else {
      await API.uploadVideo(id);
      showToast('🔄 Đang thử upload lại...', 'info');
    }
    loadVideos();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

// ─── Batch Operations ───
function toggleSelectAll() {
  const selectAll = document.getElementById('select-all').checked;
  document.querySelectorAll('.video-select').forEach(cb => { cb.checked = selectAll; });
  updateSelection();
}

function updateSelection() {
  selectedVideos.clear();
  document.querySelectorAll('.video-select:checked').forEach(cb => {
    selectedVideos.add(parseInt(cb.value));
  });
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById('batch-bar');
  if (selectedVideos.size > 0) {
    bar.style.display = 'flex';
    document.getElementById('selected-count').textContent = selectedVideos.size;
  } else {
    bar.style.display = 'none';
  }
}

async function batchSelected(action) {
  if (selectedVideos.size === 0) {
    showToast('Chưa chọn video nào', 'warning');
    return;
  }

  if (action === 'delete' && !confirm(`Xoá ${selectedVideos.size} video?`)) return;

  try {
    const ids = Array.from(selectedVideos);
    await API.batchAction(ids, action);
    showToast(`✅ Đã thực hiện ${action} cho ${ids.length} video`, 'success');
    selectedVideos.clear();
    loadVideos();
    loadStats();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

async function batchAction(action) {
  try {
    const result = await API.getVideos();
    const videos = result.data;
    let targets = [];

    switch (action) {
      case 'download':
        targets = videos.filter(v => v.status === 'pending');
        break;
      case 'generate':
        targets = videos.filter(v => v.status === 'downloaded');
        break;
      case 'upload':
        targets = videos.filter(v => v.status === 'ready');
        break;
    }

    if (targets.length === 0) {
      showToast(`Không có video nào phù hợp cho action "${action}"`, 'warning');
      return;
    }

    const ids = targets.map(v => v.id);
    await API.batchAction(ids, action);
    showToast(`✅ Đã thêm ${ids.length} jobs vào hàng đợi`, 'success');
    loadStats();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

// ─── Edit Modal ───
async function openEdit(id) {
  editingVideoId = id;
  try {
    const result = await API.getVideo(id);
    const v = result.data;

    document.getElementById('edit-title').value = v.title || '';
    document.getElementById('edit-description').value = v.description || '';
    document.getElementById('edit-tags').value = (v.tags || []).join(', ');
    document.getElementById('edit-category').value = v.category || 'Entertainment';

    document.getElementById('edit-modal').classList.add('active');
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('active');
  editingVideoId = null;
}

async function saveEdit() {
  if (!editingVideoId) return;

  const data = {
    title: document.getElementById('edit-title').value,
    description: document.getElementById('edit-description').value,
    tags: document.getElementById('edit-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    category: document.getElementById('edit-category').value,
  };

  try {
    await API.updateVideo(editingVideoId, data);
    showToast('💾 Đã lưu thay đổi', 'success');
    closeModal();
    loadVideos();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

// Close modal on outside click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeModal();
  }
});

// ─── Queue ───
async function refreshQueue() {
  try {
    const result = await API.getQueue();
    const q = result.data;
    const container = document.getElementById('queue-container');

    if (!q.processing && q.pendingJobs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">😴</div>
          <div class="empty-title">Hàng đợi trống</div>
          <div class="empty-desc">Không có job nào đang chờ xử lý</div>
        </div>`;
      return;
    }

    let html = '';

    if (q.currentJob) {
      html += `
        <div style="padding: 16px; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: var(--radius-md); margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="status-dot" style="background: var(--accent-primary); width: 8px; height: 8px; border-radius: 50%; animation: pulse-dot 1s infinite;"></div>
            <strong style="font-size: 14px;">Đang xử lý</strong>
            <span style="font-size: 13px; color: var(--text-secondary);">Video #${q.currentJob.videoId} - ${q.currentJob.type}</span>
          </div>
          <div class="progress-bar" style="margin-top: 12px;">
            <div class="progress-fill" style="width: 60%; animation: shimmer 1.5s infinite;"></div>
          </div>
        </div>`;
    }

    if (q.pendingJobs.length > 0) {
      html += `<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Đang chờ: ${q.pendingJobs.length} jobs</div>`;
      q.pendingJobs.forEach((job, i) => {
        html += `
          <div style="padding: 10px 16px; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); margin-bottom: 4px; font-size: 13px; display: flex; align-items: center; gap: 10px;">
            <span style="color: var(--text-muted);">${i + 1}.</span>
            <span>Video #${job.videoId}</span>
            <span style="color: var(--text-muted);">→ ${job.type}</span>
          </div>`;
      });
    }

    container.innerHTML = html;
  } catch (err) {
    // Silently fail
  }
}

// ─── Settings ───
async function loadSettings() {
  try {
    const stats = await API.getStats();
    const d = stats.data;

    // Gemini status
    const geminiEl = document.getElementById('gemini-status');
    if (d.geminiConfigured) {
      geminiEl.className = 'config-badge ok';
      geminiEl.textContent = '✅ Đã cấu hình';
    } else {
      geminiEl.className = 'config-badge warn';
      geminiEl.textContent = '⚠️ Chưa cấu hình - thêm GEMINI_API_KEY vào .env';
    }

    // YouTube connection
    try {
      const ytResult = await API.getYouTubeStatus();
      const yt = ytResult.data;

      if (yt.connected && yt.channel) {
        document.getElementById('yt-not-connected').style.display = 'none';
        document.getElementById('yt-connected').style.display = 'block';
        document.getElementById('yt-avatar').src = yt.channel.thumbnail || '';
        document.getElementById('yt-channel-name').textContent = yt.channel.title;
        document.getElementById('yt-sub-count').textContent = formatNumber(yt.channel.subscriberCount);
        document.getElementById('yt-video-count').textContent = formatNumber(yt.channel.videoCount);

        const ytOAuth = document.getElementById('yt-oauth-status');
        ytOAuth.className = 'config-badge ok';
        ytOAuth.textContent = '✅ Đã kết nối';
      } else {
        document.getElementById('yt-not-connected').style.display = 'block';
        document.getElementById('yt-connected').style.display = 'none';
      }
    } catch (err) {
      document.getElementById('yt-not-connected').style.display = 'block';
      document.getElementById('yt-connected').style.display = 'none';
    }
  } catch (err) {
    // Silently fail
  }
}

async function disconnectYouTube() {
  if (!confirm('Ngắt kết nối YouTube?')) return;
  try {
    await API.disconnectYouTube();
    showToast('📺 Đã ngắt kết nối YouTube', 'success');
    loadSettings();
    loadStats();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

// ─── Toast Notifications ───
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  // Auto remove after 4s
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── Utilities ───
function statusBadge(status) {
  const labels = {
    pending: 'Đang chờ',
    downloading: 'Đang tải',
    downloaded: 'Đã tải',
    generating: 'Đang tạo AI',
    ready: 'Sẵn sàng',
    uploading: 'Đang upload',
    uploaded: 'Đã upload',
    failed: 'Thất bại',
  };

  return `<span class="status-badge status-${status}">
    <span class="status-dot"></span>
    ${labels[status] || status}
  </span>`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatNumber(num) {
  if (!num) return '0';
  num = parseInt(num);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}
