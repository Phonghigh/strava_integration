// manual-sync.js
import "dotenv/config";
import { connectDB } from "./src/db/connect.js";
import { syncAllUsersActivities } from "./src/services/sync.service.js";

const runManualSync = async () => {
    console.log("------- BẮT ĐẦU ĐỒNG BỘ DỮ LIỆU THỦ CÔNG (MANUAL SYNC) -------");
    try {
        // 1. Kết nối DB
        await connectDB();
        console.log("✅ Đã kết nối Database.");

        // 2. Gọi hàm sync toàn bộ user
        console.log("⏳ Đang đồng bộ... (Quá trình này có thể mất vài giây)");
        const result = await syncAllUsersActivities();

        // 3. Hiển thị kết quả
        console.log("\n------- KẾT QUẢ -------");
        console.log(`- Tổng số User: ${result.usersCount}`);
        console.log(`- Tổng số hoạt động đã sync: ${result.totalSynced}`);
        console.log("✅ Hoàn tất!");
        
        process.exit(0);
    } catch (error) {
        console.error("\n❌ LỖI KHI ĐANG SYNC:", error.message);
        process.exit(1);
    }
};

runManualSync();
