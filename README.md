# 🚀 Douyin → YouTube Shorts Automation Tool

Tool tự động tải hàng loạt video Douyin (không watermark), sử dụng AI Gemini để phân tích và tạo tiêu đề, mô tả, hashtag, tự động tạo thumbnail và đăng tải lên YouTube Shorts.

![Dashboard Preview](public/css/style.css)

---

## ✨ Tính năng nổi bật

- 📥 **Tải video Douyin hàng loạt**: Tự động parse link chia sẻ (v.douyin.com / douyin.com), tải video gốc chất lượng cao không dính logo watermark.
- 🤖 **AI Video Analysis (Google Gemini)**: Phân tích nội dung video trực tiếp, tự động sinh Title chuẩn SEO YouTube Shorts (kèm `#Shorts`), Description chi tiết với danh sách hashtag trending, và danh mục (Category) phù hợp.
- 🖼️ **Auto Thumbnail Generator**: Tự động trích xuất frame tối ưu từ video bằng `ffmpeg`, tinh chỉnh độ sáng/độ tương phản và làm nét.
- 📺 **Đăng tải YouTube Shorts tự động**: Tích hợp YouTube Data API v3 với OAuth 2.0, tự động upload video kèm thumbnail, tags, và thiết lập chế độ hiển thị (Public, Unlisted, Private).
- ⚡ **Quản lý hàng đợi (Job Queue)**: Xử lý video tuần tự, hỗ trợ thao tác hàng loạt (Batch Actions: tải tất cả, tạo caption tất cả, upload tất cả).
- 🎨 **Giao diện Web Dashboard Premium**: Thiết kế Dark Mode hiện đại, hiệu ứng Glassmorphism, cập nhật trạng thái thời gian thực.

---

## 🛠️ Cài đặt & Chạy Local

### 1. Yêu cầu hệ thống
- **Node.js**: Phiên bản 18+ trở lên
- **FFmpeg**: *(Tùy chọn)* Cài đặt `ffmpeg` trên máy để kích hoạt tính năng trích xuất thumbnail.

### 2. Cài đặt dependencies
```bash
git clone https://github.com/Dellyhihi/douyin-to-youtube-shorts.git
cd douyin-to-youtube-shorts
npm install
```

### 3. Cấu hình biến môi trường
Sao chép file `.env.example` thành `.env` và điền các API keys cần thiết:

```env
# Google Gemini API Key (Lấy miễn phí tại: https://aistudio.google.com/apikey)
GEMINI_API_KEY=your_gemini_api_key_here

# YouTube OAuth 2.0 Credentials (Tạo tại: https://console.cloud.google.com/)
YOUTUBE_CLIENT_ID=your_youtube_client_id_here
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret_here
YOUTUBE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback

# Cài đặt server
PORT=3000

# Tuỳ chọn caption & upload
CAPTION_LANGUAGE=vi
CAPTION_STYLE=trending
DEFAULT_PRIVACY=unlisted
MAX_UPLOADS_PER_DAY=5
```

### 4. Khởi chạy
```bash
npm run dev
# hoặc
npm start
```
Truy cập giao diện tại: **`http://localhost:3000`**

---

## ☁️ Hướng dẫn Deploy lên Vercel

1. **Push source code lên GitHub** (đã được cấu hình sẵn `vercel.json` và `api/index.js`).
2. Truy cập [Vercel Dashboard](https://vercel.com/new) → Chọn **Import Git Repository**.
3. Trong phần **Environment Variables**, thêm các biến:
   - `GEMINI_API_KEY`
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`
   - `YOUTUBE_REDIRECT_URI` (Cập nhật domain Vercel: `https://your-app.vercel.app/auth/youtube/callback`)
   - `CAPTION_LANGUAGE`, `CAPTION_STYLE`, `DEFAULT_PRIVACY`
4. Bấm **Deploy**.

> 💡 **Lưu ý về Serverless trên Vercel**: Vercel phù hợp để chạy Dashboard và xử lý các tác vụ API ngắn. Đối với các tác vụ tải video dung lượng lớn và render ffmpeg nặng liên tục, bạn nên ưu tiên chạy local hoặc deploy trên Docker / VPS (như Render, Railway, VPS riêng) để có ổ đĩa lưu trữ lâu dài và không bị giới hạn thời gian chạy function.

---

## 📜 Cấu trúc mã nguồn

```
├── api/
│   └── index.js              # Vercel serverless entrypoint
├── public/
│   ├── index.html            # Giao diện SPA Dashboard
│   ├── css/style.css         # Dark theme CSS
│   └── js/                   # Frontend app & API client
├── src/
│   ├── config/database.js    # JSON database engine (serverless compatible)
│   ├── models/video.js       # Video Model CRUD
│   ├── routes/               # API & YouTube Auth endpoints
│   ├── services/             # Douyin downloader, Gemini AI, Thumbnail, YouTube uploader
│   └── utils/                # Logger, helpers
├── server.js                 # Express server
├── vercel.json               # Vercel routing
└── package.json
```

---

## ⚖️ Miễn trừ trách nhiệm (Disclaimer)
Dự án được tạo ra nhằm mục đích học tập, nghiên cứu và quản lý nội dung tự động hợp pháp. Hãy đảm bảo bạn tuân thủ Điều khoản sử dụng của TikTok/Douyin và YouTube, cũng như tôn trọng bản quyền của tác giả nội dung.
