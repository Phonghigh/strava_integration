# TÀI LIỆU API CHO FRONTEND (VIETSEEDS RUN 2026)

Tài liệu này cung cấp toàn bộ thông tin về các cống API (Endpoint) chuẩn `v1` đang được chạy trên Backend.

---

## 🛑 BẢO MẬT & XÁC THỰC (JWT)
Hầu hết các API của hệ thống (ngoại trừ login, leaderboard và thông số chung) đều yêu cầu đính kèm Header:
`Authorization: Bearer <vietseeds_jwt_token>`

---

## 1. XÁC THỰC (AUTHENTICATION)

### 1.1 Trao đổi mã Strava Code lấy Token (Login)
- **Endpoint:** `POST /api/v1/auth/strava/exchange`
- **Mô tả:** Frontend cho user login Strava -> Lấy được `code` trên URL. Frontend bắn `code` đó vào API này để lấy JWT lưu vào localStorage. Quá trình này **Tự Động** đăng ký luôn user vào Database.
- **Request Body:**
  ```json
  { "code": "mã_code_từ_URL" }
  ```
- **Response (200 OK):**
  ```json
  {
    "token": "vietseeds_jwt_token...",
    "user": {
      "id": "64c8d...",
      "stravaId": "123456",
      "name": "Nguyễn Văn A",
      "avatar": "https://...",
      "teamName": "No Team"
    }
  }
  ```

### 1.2 Lấy thông tin tài khoản hiện tại (Me)
- **Endpoint:** `GET /api/v1/auth/me`
- **Yêu cầu:** Token `Bearer`
- **Mô tả:** Trả về thông tin cá nhân và tổng số Km hợp lệ mà người đó ĐÃ chạy được. (Có thể dùng làm profile page).

---

## 2. THỐNG KÊ CHIẾN DỊCH CHUNG

### 2.1 Tổng quan giải chạy
- **Endpoint:** `GET /api/v1/campaign/stats`
- **Mô tả:** Trả về tổng quãng đường của tất cả người chơi. Dùng để vẽ thanh Progress Bar ngoài Landing page.
- **Response (200 OK):**
  ```json
  {
    "targetKm": 10000,
    "currentKm": 154.5,
    "totalRunners": 23,
    "totalActivities": 120
  }
  ```

---

## 3. LỊCH SỬ HOẠT ĐỘNG (TRACKLOGS)

### 3.1 Danh sách lịch sử chạy ĐÃ PHÂN TRANG
- **Endpoint:** `GET /api/v1/activities/me?page=1&limit=10`
- **Yêu cầu:** Token `Bearer`
- **Mô tả:** Danh sách các tracklogs chi tiết của chính user đó. Nó bao gồm trường `"isValid"` để FE biết hoạt động này có bị loại vì Pace không hợp lệ hay không.
- **Response (200 OK):**
  ```json
  {
    "data": [
      {
        "activityId": "strava_777",
        "name": "Chạy bộ sáng sớm",
        "distance": 5.2,
        "movingTime": 1800,
        "pace": "5:46",
        "date": "2026-04-02T10:00:00Z",
        "isValid": true
      }
    ],
    "meta": {
      "total": 50,
      "currentPage": 1,
      "totalPages": 5
    }
  }
  ```

### 3.2 Đồng bộ bằng tay (F5/Refresh)
- **Endpoint:** `POST /api/v1/activities/sync`
- **Yêu cầu:** Token `Bearer`
- **Mô tả:** Trigger server đi quét và lấy dữ liệu mới nhất nếu CronJob tự động chưa kịp chạy. (Nên chèn nút Loading).

---

## 4. XẾP HẠNG (LEADERBOARD)

*(Lưu ý: Tất cả các bảng xếp hạng đều loại bỏ sẵn những tracklogs gian lận lỗi Pace hoặc sai môn thể thao).*

### 4.1 Bảng xếp hạng Cá Nhân
- **Endpoint:** `GET /api/v1/leaderboard/individuals?page=1&limit=50`
- **Mô tả:** Trả về danh sách xếp hạng user theo số KM từ cao xuống thấp. Tự động tính thứ hạng cứng (`rank`).

### 4.2 Bảng xếp hạng Đội/Team
- **Endpoint:** `GET /api/v1/leaderboard/teams?page=1&limit=20`
- **Mô tả:** Gom toàn bộ những thành viên có team giống nhau, cộng tổng số KM rồi chia xếp hạng từng Team chuẩn mực.

---

## Lưu ý về Logic Pace (luật hợp lệ)
API Backend đã xử lý tự động bỏ qua mọi tracklog vi phạm. Các quy định được gắn trong code bao gồm:
1. Môn thể thao bắt buộc: **Run (Chạy bộ)**
2. Pace phải nằm trong khoảng: **Từ 4:00/km đến 15:00/km.**
*Toàn bộ data không đáp ứng cấu trúc này vẫn được kéo về để lưu trữ nhưng `isValid: false`.*
