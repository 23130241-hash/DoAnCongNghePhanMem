⚡️ BUSINESS REQUIREMENTS DOCUMENT (BRD) – TOWER DEFENSE PROJECT ⚡️
1. THÔNG TIN CHUNG (PROJECT OVERVIEW)

TÊN DỰ ÁN: TOWER DEFENSE OFFLINE

TẦM NHÌN:
Tạo ra một trò chơi TOWER DEFENSE OFFLINE, chiến thuật, nhịp độ vừa phải, dễ tiếp cận nhưng có chiều sâu về nâng cấp trụ, nhằm tối ưu hóa trải nghiệm người chơi và doanh thu từ quảng cáo (nếu cần).

NỀN TẢNG: ANDROID / IOS / PC (offline cơ bản, dữ liệu lưu cục bộ)

2. MỤC TIÊU CHIẾN LƯỢC (BUSINESS OBJECTIVES)

🚀 [BO-01] ENGAGEMENT:
Người chơi dành trung bình >15–20 PHÚT mỗi phiên chơi qua vòng lặp gameplay cốt lõi.

💰 [BO-02] MONETIZATION:
Tích hợp QUẢNG CÁO NHẬN THƯỞNG và vật phẩm ảo (VÀNG, KIM CƯƠNG) mà không làm gián đoạn trải nghiệm.

⚙️ [BO-03] SCALABILITY:
Hệ thống cho phép thêm mới TRỤ (TOWERS) và QUÁI (ENEMIES) chỉ bằng cách thay đổi cấu hình dữ liệu (JSON/CSV).

📴 [BO-04] OFFLINE PLAY:
Người chơi có thể trải nghiệm toàn bộ gameplay cơ bản mà KHÔNG CẦN INTERNET.

3. QUY TẮC NGHIỆP VỤ (BUSINESS RULES)

🏗️ [BR-01] GIỚI HẠN XÂY DỰNG:
Trụ chỉ được đặt trên các "BUILD POINT" đã quy định; KHÔNG ĐƯỢC CHỒNG LẤN.

💵 [BR-02] KINH TẾ TRONG TRẬN:
VÀNG KIẾM ĐƯỢC trong màn chơi (IN-MATCH GOLD) sẽ bị RESET khi kết thúc màn.

📈 [BR-03] CHI PHÍ LŨY TIẾN:
Chi phí nâng cấp trụ mỗi cấp TĂNG TỐI THIỂU 50% so với cấp trước.

⛔ [BR-04] PHẠT RÚT LUI:
Nếu người chơi thoát giữa trận, TOÀN BỘ PHẦN THƯỞNG TRONG TRẬN BỊ HỦY.

⏱️ [BR-05] HỒI CHIÊU KỸ NĂNG:
Kỹ năng đặc biệt KHÔNG THỂ DÙNG LIÊN TỤC để duy trì cân bằng độ khó.

4. PHẠM VI GIẢI PHÁP (SOLUTION SCOPE)
A. HỆ THỐNG GAME LOGIC (CORE)

GRID SYSTEM: Quản lý tọa độ và tính hợp lệ khi đặt trụ.

WAVE ENGINE: Tự động spawn quái dựa trên cấu hình thời gian và số lượng.

DAMAGE PROCESSOR: Xử lý tương tác giữa đạn, trụ và quái.

B. HỆ THỐNG KINH TẾ & DỮ LIỆU

BALANCE SHEET: File trung tâm chứa các chỉ số HP, DAMAGE, SPEED, COST.

CURRENCY MANAGER: Quản lý TIỀN TRONG TRẬN và TIỀN NÂNG CẤP VĨNH VIỄN.

5. YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)

⚡ PERFORMANCE:
Game duy trì 60 FPS ngay cả khi >100 quái vật xuất hiện.

📴 OFFLINE PLAY:
Chơi được tất cả màn cơ bản mà KHÔNG CẦN INTERNET.

💾 DATA INTEGRITY:
Tiền và tiến trình lưu CỤC BỘ, đồng bộ CLOUD khi có mạng.

🎨 UI/UX:
Giao diện TRỰC QUAN, DỄ HỌC, hiển thị thông tin cơ bản: TIỀN, LEVEL, HP CĂN CỨ.

6. LOẠI THÁP (TOWERS)

🔫 THÁP BẮN NHANH:
Bắn nhiều lần, sát thương thấp, tầm trung.

💥 THÁP SÁT THƯƠNG MẠNH:
Bắn chậm, sát thương cao, tầm gần.

❄️ THÁP LÀM CHẬM:
Giảm tốc độ kẻ thù trong phạm vi hiệu ứng.

7. LOẠI KẺ THÙ (ENEMIES)

👾 KẺ THÙ THƯỜNG:
Tốc độ trung bình, HP thấp.

🏃 KẺ THÙ NHANH:
Tốc độ cao, HP thấp.

🛡️ KẺ THÙ KHỎE:
Tốc độ chậm, HP cao.

8. FLOW GAMEPLAY
MỞ GAME → HIỂN THỊ MENU CHÍNH

CHỌN LEVEL → TẢI BẢN ĐỒ, SỐ THÁP VÀ TIỀN BAN ĐẦU

XÂY THÁP → ĐẶT TRÊN CÁC BUILD POINT HỢP LỆ

KHỞI CHẠY LÀN SÓNG QUÁI → QUÁI DI CHUYỂN THEO ĐƯỜNG, TRỤ TỰ TẤN CÔNG

NÂNG CẤP TRỤ → SỬ DỤNG TIỀN ĐỂ TĂNG SÁT THƯƠNG, TỐC ĐỘ, TẦM BẮN

KẾT THÚC LEVEL → NẾU CĂN CỨ SỐNG SÓT: NHẬN ĐIỂM, TIỀN, PHẦN THƯỞNG; NẾU THẤT BẠI: MẤT PHẦN THƯỞNG TRONG MÀN

9. CHỈ SỐ ĐO LƯỜNG (KPIs)

📊 D1 RETENTION:

35% người chơi quay lại ngày hôm sau.

🏆 WIN/LOSS RATIO:
Level đầu đạt 80% TỶ LỆ THẮNG để giữ chân người mới.

⚡ AVERAGE UPGRADE LEVEL:
Mức nâng cấp trung bình trước khi vượt BOSS ĐẦU TIÊN.
