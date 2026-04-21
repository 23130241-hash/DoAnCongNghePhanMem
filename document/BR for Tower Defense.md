BUSINESS REQUIREMENTS DOCUMENT (BRD) - TOWER DEFENSE PROJECT
1. Thông tin chung (Project Overview)
Tên dự án: Tower Defense

Tầm nhìn: Tạo ra một trò chơi chiến thuật có nhịp độ nhanh, dễ tiếp cận nhưng có chiều sâu về nâng cấp, nhằm tối ưu hóa doanh thu từ quảng cáo và mua hàng trong ứng dụng.

2. Mục tiêu chiến lược (Business Objectives)
[BO-01] Engagement: Người chơi dành trung bình >20 phút/phiên chơi thông qua vòng lặp gameplay cốt lõi.

[BO-02] Monetization: Tích hợp hệ thống quảng cáo nhận thưởng và vật phẩm ảo (Vàng, Kim cương) mà không làm gián đoạn trải nghiệm.

[BO-03] Scalability: Hệ thống cho phép thêm mới Trụ (Towers) và Quái (Enemies) chỉ bằng cách thay đổi cấu hình dữ liệu (JSON/CSV).

3. Quy tắc nghiệp vụ (Business Rules - BR)
Lưu ý: Đây là các logic bắt buộc mà đội ngũ phát triển phải tuân thủ để đảm bảo tính kinh tế và cân bằng của trò chơi.

[BR-01] Giới hạn xây dựng (Liên kết UC: UC-01)

Mô tả: Trụ chỉ được đặt trên các "Build Point" đã quy định. Không cho phép chồng lấn.

[BR-02] Kinh tế trong trận (Liên kết UC: UC-01, 02)

Mô tả: Vàng kiếm được trong màn chơi (In-match Gold) sẽ mất đi khi kết thúc màn đó.

[BR-03] Chi phí lũy tiến (Liên kết UC: UC-02)

Mô tả: Chi phí nâng cấp trụ mỗi cấp phải tăng tối thiểu 50% so với cấp trước đó.

[BR-04] Phạt rút lui (Liên kết UC: UC-05)

Mô tả: Nếu người chơi thoát trận giữa chừng, toàn bộ phần thưởng thu thập trong trận đó sẽ bị hủy.

[BR-05] Hồi chiêu kỹ năng (Liên kết UC: UC-04)

Mô tả: Kỹ năng đặc biệt không thể sử dụng liên tục để tránh làm mất cân bằng độ khó.

4. Phạm vi giải pháp (Solution Scope)
Dựa trên User Case Requirements, hệ thống phần mềm cần đáp ứng:

A. Hệ thống Game Logic (Core)
Grid System: Quản lý tọa độ và tính hợp lệ khi đặt trụ (UC-01).

Wave Engine: Tự động hóa việc spawn quái theo cấu hình thời gian và số lượng (UC-03).

Damage Processor: Xử lý tương tác giữa các loại đạn và thuộc tính quái vật.

B. Hệ thống Kinh tế & Dữ liệu
Balance Sheet: Một file trung tâm (Excel/Google Sheet) chứa toàn bộ chỉ số HP, Damage, Speed, Cost.

Currency Manager: Quản lý hai loại tiền (Tiền trong trận và Tiền hệ thống để nâng cấp vĩnh viễn).

5. Yêu cầu phi chức năng (Non-Functional Requirements)
Performance: Game phải duy trì ổn định 60 FPS ngay cả khi có >100 quái vật xuất hiện cùng lúc (UC-03).

Offline Play: Người chơi có thể trải nghiệm các màn chơi cơ bản mà không cần kết nối Internet (ngoại trừ nạp tiền).

Data Integrity: Tiền và tiến trình của người chơi phải được lưu cục bộ (Local) và đồng bộ ngay khi có mạng (Cloud).

6. Chỉ số đo lường (KPIs)
D1 Retention: >35% người chơi quay lại vào ngày hôm sau.

Win/Loss Ratio: Tỷ lệ thắng ở các level đầu nên đạt 80% để giữ chân người chơi mới.

Average Upgrade Level: Cấp độ nâng cấp trung bình của người chơi trước khi vượt qua Boss đầu tiên.
