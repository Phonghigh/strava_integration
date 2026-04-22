# Skill: Xử lý Kết nối Database "Bất Tử" (Resilient MongoDB Connection)

> **Mục tiêu:** Giúp Newbie hiểu tại sao code chạy ở quán cafe thì được mà ở nhà lại lỗi, và làm sao để code "chấp mọi loại mạng".

---

## 1. Tổng Quan & Tài Liệu (Documentation)
*   **Vấn đề là gì?** MongoDB Atlas sử dụng chuỗi kết nối `mongodb+srv://`. Chữ **srv** ở đây nghĩa là một bản ghi DNS đặc biệt để tìm danh sách các server.
*   **Bối cảnh:** Ở Việt Nam, nhiều Modem hoặc DNS của nhà mạng không hỗ trợ tốt việc tìm kiếm bản ghi SRV này, dẫn đến lỗi "Không tìm thấy server" (`ECONNREFUSED`).
*   **Tài liệu tham khảo:** [MongoDB DNS Seedlist Connection Format](https://www.mongodb.com/docs/manual/reference/connection-string/#dns-seedlist-connection-format)

## 2. Giải Thích Chi Tiết (Deep Dive)
*   **Cơ chế hoạt động:** Khi bạn chạy `mongoose.connect()`, Node.js sẽ hỏi máy chủ DNS (thường là Router nhà bạn): *"Địa chỉ thực sự của cái Cluster này là gì?"*.
*   **Tại sao lỗi?** Router nhà bạn (tại `192.168.1.1`) có thể trả lời: *"Tôi không biết"* hoặc *"Tôi bị quá tải"*. Ngoài ra, Node.js v17+ hay cố hỏi qua đường IPv6, mà IPv6 ở nhiều nơi chưa ổn định, dẫn đến đứng hình kết nối.
*   **Giải pháp:** Chúng ta "băng qua" Router nhà bạn bằng cách hỏi thẳng máy chủ DNS của Google (`8.8.8.8`) - nơi luôn biết mọi câu trả lời.

## 3. Code Mẫu chuẩn (Code Samples)

### ❌ Cách làm sai (Cho người mới bắt đầu)
Code này rất dễ lỗi khi mạng yếu hoặc DNS router cùi:
```javascript
// Rất hên xui
await mongoose.connect(process.env.MONGODB_URI);
```

### ✅ Cách làm chuẩn (Professional/Resilient)
```javascript
import dns from 'node:dns';

// 1. Ép Node.js ưu tiên IPv4 (tránh lỗi IPv6)
dns.setDefaultResultOrder('ipv4first');

// 2. Dùng Google DNS thay vì dùng DNS mặc định của máy/router
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
  const opts = {
    family: 4, // 3. Ép driver dùng IPv4 để kết nối
    serverSelectionTimeoutMS: 10000, // 4. Cho phép chờ lâu hơn một chút (10s)
  };
  await mongoose.connect(process.env.MONGODB_URI, opts);
};
```

## 4. Trường Hợp Thực Tế (Real-world Cases)
*   **Ví dụ 1 (Phát triển tại nhà):** Bạn dùng mạng VNPT/Viettel, router cũ. Thường xuyên bị `ECONNREFUSED`. Giải pháp DNS bypass là cứu cánh duy nhất.
*   **Ví dụ 2 (Deploy lên Cloud - Render/Heroku):** Các môi trường này DNS cực chuẩn, code cũ vẫn chạy. Nhưng nếu bạn có bộ code "Resilient", nó sẽ chạy ổn định ở cả nhà lẫn trên mây.

## 5. Quy Trình Thực Hiện (Workflow)
1.  **Bước 1:** Kiểm tra lỗi. Nếu có chữ `querySrv` và `ECONNREFUSED` -> Chắc chắn là lỗi DNS.
2.  **Bước 2:** Dùng lệnh `nslookup -type=SRV [tên_miền_atlas]` để kiểm tra xem router có trả về kết quả không.
3.  **Bước 3:** Áp dụng `dns.setServers` vào file khởi tạo kết nối DB của bạn.
4.  **Bước 4:** Test lại bằng một script nhỏ (như `test-db.js`).

## 6. Sơ Đồ Quyết Định (Decision Tree)

| Nếu gặp lỗi... | Kiểm tra... | Giải pháp ưu tiên |
| :--- | :--- | :--- |
| `ECONNREFUSED` + `querySrv` | DNS Router | Code bypass DNS (`setServers`) |
| `ETIMEOUT` | Firewall / IP Whitelist | Kiểm tra Network Access trên Atlas Dashboard |
| `Authentication Failed` | Username/Password | Kiểm tra lại `.env` |
| Máy khác chạy được, máy mình không | Local Network/IPv6 | Ép `family: 4` và `ipv4first` |

---
*Người viết: Antigravity AI Guide - Trao cho bạn cần câu thay vì con cá.*
