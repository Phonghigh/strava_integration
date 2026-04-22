# Knowledge: Giải quyết lỗi MongoDB Connection (querySrv ECONNREFUSED)

Tài liệu này tổng hợp kiến thức về lỗi kết nối MongoDB Atlas và cách xử lý triệt để trong dự án.

## 1. Bản chất của lỗi
Lỗi `querySrv ECONNREFUSED` thường xuất hiện khi sử dụng giao thức `mongodb+srv://`. Giao thức này yêu cầu Node.js thực hiện tìm kiếm **DNS SRV records** để xác định danh sách các server con (shards).

Lỗi xảy ra khi trình phân giải DNS cục bộ (thường là modem nhà mạng hoặc router) không trả về kết quả hoặc từ chối yêu cầu SRV này.

## 2. Các yếu tố gây lỗi
*   **DNS IPv6:** Node.js v17+ ưu tiên IPv6. Nếu mạng nhà bạn hỗ trợ IPv6 không đầy đủ, nó sẽ bị treo khi hỏi DNS qua IPv6.
*   **DNS Hijacking/Failure:** Một số nhà mạng tại Việt Nam có thể chặn hoặc không hỗ trợ các bản ghi SRV phức tạp trên máy chủ DNS mặc định của họ.

## 3. Cách xử lý trong Code (Best Practice)
Để đảm bảo ứng dụng chạy được trên mọi môi trường mạng (kể cả mạng nhà mạng yếu), chúng ta nên áp dụng các cấu hình sau trong file kết nối DB:

### Bước 1: Ép sử dụng DNS tin cậy
Sử dụng Google DNS (`8.8.8.8`) thay vì dùng DNS của router.
```javascript
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
```

### Bước 2: Ưu tiên IPv4
Giảm thiểu lỗi chờ đợi bằng cách ép Node.js kiểm tra IPv4 trước.
```javascript
dns.setDefaultResultOrder('ipv4first');
```

### Bước 3: Cấu hình Mongoose Driver
Yêu cầu Driver sử dụng IPv4 khi thiết lập kết nối socket.
```javascript
const options = {
  family: 4,
  serverSelectionTimeoutMS: 10000 // Tăng thời gian chờ nếu mạng chậm
};
await mongoose.connect(uri, options);
```

## 4. Bài học rút ra
Khi gặp các lỗi về mạng (Network/Connection) có tính chất chập chờn (intermittent), hãy kiểm tra lớp DNS đầu tiên. Việc tự cấu hình DNS servers trong code là một kỹ thuật mạnh mẽ để giúp ứng dụng "tự động hóa" việc sửa lỗi môi trường cho người dùng cuối.
