# Hướng dẫn sử dụng các Scripts trong Strava Integration

Tài liệu này mô tả các công cụ dòng lệnh (CLI) hiện có trong dự án và cách sử dụng chúng để quản lý dữ liệu Strava, xác thực tính hợp lệ và bảo trì hệ thống.

---

## 1. Đồng bộ dữ liệu (Sync)

### A. Đồng bộ từ Strava Club (`manual-club-sync.js`)
Đây là script chính dùng để cào dữ liệu từ Strava Club. Nó thực hiện qua 2 giai đoạn: Cập nhật thành viên và Cào danh sách hoạt động mới từ bảng tin (Club Feed) hoặc từng Athlete.

**Cách dùng:**
```powershell
node manual-club-sync.js [options]
```

**Các tham số chính:**
- `--month=YYYYMM`: Lọc dữ liệu theo tháng (Ví dụ: `--month=202604`).
- `--week=YYYYWW`: Lọc dữ liệu theo tuần (Ví dụ: `--week=202614`).
- `--full`: Chế độ đồng bộ đầy đủ (quét sâu hơn vào quá khứ).
- `--phase=[1|3]`: Chạy riêng biệt từng giai đoạn:
  - `1`: Chỉ cập nhật danh sách thành viên Club (đồng bộ User).
  - `3`: Quét sâu theo từng vận động viên (Athlete-based sync) để tìm hoạt động mới.
- `--concurrency=N`: Số luồng chạy song song (mặc định là 3).
- `--athleteId=ID`: Chỉ đồng bộ cho 1 vận động viên cụ thể.

**Lệnh thường dùng:**
```powershell
# Cập nhật thành viên và quét hoạt động mới của tháng 4
node manual-club-sync.js --month=202604 --phase=3
```

### B. Cào chi tiết bản đồ và Pace (`src/scripts/local-detail-scraper.js`)
Dùng để cào sâu vào từng hoạt động để lấy tọa độ GPS (Polyline), nhịp tim, độ cao và tính toán lại Pace chính xác. 
> [!IMPORTANT]
> Flag `--detail` trong `manual-club-sync.js` đã bị loại bỏ. Hãy sử dụng script này để thay thế.

**Cách dùng:**
```powershell
node src/scripts/local-detail-scraper.js [options]
```

**Các tham số:**
- `--all`: Cào toàn bộ các hoạt động chưa có chi tiết.
- `--limit=N`: Giới hạn số lượng hoạt động (mặc định 500).
- `--force`: Cào lại cả những hoạt động đã có chi tiết.
- `--concurrency=N`: Số luồng trình duyệt chạy song song (mặc định 3).

---

## 2. Xác thực và Bảo trì dữ liệu

### Xác thực tính hợp lệ (`verify-activities-validity.js`)
Kiểm tra lại toàn bộ hoạt động trong Database và đánh dấu `isValid: true/false` dựa trên quy định:
- Loại hình: **Run** hoặc **VirtualRun**.
- Quãng đường: **>= 1km**.
- Pace: Trong khoảng **4:00 - 15:00** min/km.

**Cách dùng:**
```powershell
node verify-activities-validity.js
```

### Dọn dẹp và Đối soát (`reconcile-activities.js`)
Dùng để bảo trì database: xóa các hoạt động cũ (trước tháng 4/2026), hoạt động 0km, và gắn lại các hoạt động "mồ côi" (không có userId) cho đúng chủ sở hữu.

**Cách dùng:**
```powershell
node reconcile-activities.js
```

---

## 3. Khớp dữ liệu Thành viên (Mapping)

### Khớp từ Google Sheet (`sync-gsheet.js`)
Tự động tải danh sách đăng ký từ Google Sheet và dùng thuật toán "Fuzzy Match" để gắn Email, Team, City cho User dựa trên tên hiển thị trên Strava.

**Cách dùng:**
```powershell
node sync-gsheet.js
```
*Lưu ý: Nếu không tải được dữ liệu, hãy kiểm tra cấu hình Google DNS (8.8.8.8).*

### Khớp từ file CSV nội bộ (`src/scripts/update-team-names.js`)
Sử dụng file CSV local để cập nhật thông tin Team/Nhóm theo định dạng chuẩn: `Nhóm [N] [Khu vực]`.

**Cách dùng:**
```powershell
node src/scripts/update-team-names.js
```

---

## 4. Công cụ hỗ trợ khác

- **`auto-follow-members.js`**: Tự động Follow tất cả thành viên trong Club để tăng tỷ lệ cào dữ liệu thành công.
- **`map-strava-to-csv.js`**: Xuất toàn bộ dữ liệu hoạt động hợp lệ ra file `VIETSEEDS_FINAL.csv`.
- **`debug-stats.js`**: Xem nhanh thống kê tổng số User và Activities hiện có.
- **`prepend-team-names.js`**: Công cụ xử lý file CSV, tự động thêm tiền tố Team vào tên vận động viên để dễ phân loại.

---

## Các lệnh tắt (NPM Scripts)
Bạn có thể dùng các lệnh rút gọn khai báo trong `package.json`:
- `npm run sync-club`: Tương đương `node manual-club-sync.js`.
- `npm run sync-now`: Đồng bộ nhanh toàn bộ User hiện có.

## Lưu ý quan trọng
1. **Cookie Strava**: Các script cào dữ liệu (Sync Phase 3 và Detail Scraper) yêu cầu `strava_remember_token` còn hiệu lực trong file `.env`.
2. **Thứ tự vận hành chuẩn**: 
   `Sync Club` -> `Detail Scraper` -> `Verify Validity` -> `Map CSV`.
3. **Hiệu suất**: Khi chạy Detail Scraper, không nên đặt `--concurrency` quá cao (tối đa 5) để tránh bị Strava chặn (Rate limit) hoặc treo máy.
4. **Kết nối mạng & Database**: 
   - Đảm bảo DNS máy chủ/máy chạy script được cấu hình sang Google DNS (`8.8.8.8`, `8.8.4.4`) để truy cập Strava và Google Sheet ổn định.
   - Khi cấu hình `MONGODB_URI`, ưu tiên sử dụng kết nối qua IPv4 để tránh các lỗi timeout không đáng có.
