# 🎬 Douyin Video Downloader (Không Logo / Watermark) & Bộ Sưu Tập Video

Ứng dụng web cao cấp giúp tải hàng loạt video từ **Douyin (抖音)** và **TikTok** không dính logo/watermark, tự động lưu trữ và quản lý vào **Bộ sưu tập video** trên máy tính.

---

## ✨ Tính năng nổi bật

- 📥 **Tải hàng loạt không giới hạn**: Dán nhiều link hoặc cả đoạn text chia sẻ từ app Douyin/TikTok (mỗi link 1 dòng), tool tự động nhận diện và xếp hàng tải về.
- ✨ **Xóa sạch 100% Watermark & Logo**: Tải trực tiếp stream gốc chất lượng cao nhất (1080p / 60fps) từ CDN ByteDance.
- ⚡ **Tự động vượt chặn**: Cơ chế tự động cấp token ByteDance `TTWID` hoàn toàn tự động, không cần đăng nhập hay copy cookie thủ công.
- 🎬 **Bộ sưu tập & Trình phát Video**:
  - Giao diện dạng lưới (Grid Card) và dạng bảng (Table) hiện đại.
  - Xem video trực tiếp trong popup player với đầy đủ thông tin: Tác giả, Thời lượng, Dung lượng, Caption gốc.
- 💾 **Lưu về máy tính 1-Click**: Tải file `.mp4` trực tiếp về máy tính bất kỳ lúc nào.
- 🔍 **Tìm kiếm & Lọc nhanh**: Tìm theo tiêu đề, hashtag, tên tác giả trong bộ sưu tập.

---

## 🛠️ Cài đặt & Sử dụng

### 1. Cài đặt dependencies
```bash
git clone https://github.com/Dellyhihi/douyin-to-youtube-shorts.git
cd douyin-to-youtube-shorts
npm install
```

### 2. Khởi chạy ứng dụng
```bash
npm start
```
Mở trình duyệt truy cập: **`http://localhost:3000`**

---

## 📁 Cấu trúc thư mục

```
dichcapcut/
├── downloads/             # Nơi lưu trữ các file video MP4 đã tải về
├── data/
│   └── videos.json        # Cơ sở dữ liệu lưu trữ danh sách bộ sưu tập
├── public/                # Giao diện người dùng Web Dashboard
│   ├── css/style.css      # Giao diện Dark Theme cao cấp
│   ├── js/app.js          # Xử lý tương tác & phát video
│   └── index.html         # Trang chính ứng dụng
├── src/
│   ├── services/
│   │   ├── douyin-downloader.js  # Bộ giải mã & tải video không logo
│   │   └── job-queue.js          # Hàng đợi xử lý tải tuần tự
│   └── routes/
│       └── api.js         # RESTful API
└── server.js              # Khởi chạy Express Server
```
