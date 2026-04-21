BUSINESS REQUIREMENTS DOCUMENT (BRD) – TOWER DEFENSE GAME
1. Mục tiêu chiến lược (Business Objectives)
BO-01 (Engagement): Tạo ra trải nghiệm chơi game gây nghiện thông qua vòng lặp: Đặt trụ -> Diệt quái -> Thu tiền -> Nâng cấp.
BO-02 (Monetization): Tối ưu hóa doanh thu bằng cách khuyến khích người chơi sử dụng kỹ năng đặc biệt (UC-04) và nâng cấp trụ (UC-02), từ đó tạo nhu cầu mua vật phẩm hỗ trợ hoặc xem quảng cáo để kiếm thêm tiền (Gold).
BO-03 (Retention): Giữ chân người dùng thông qua hệ thống tiến triển (Leveling) và độ khó tăng dần theo từng Wave (UC-03).
2. Quy tắc nghiệp vụ (Business Rules - BR)
Các quy tắc này là "luật chơi" mà hệ thống phần mềm phải tuân thủ để đảm bảo tính cân bằng và kinh tế trong game:
ID	Tên quy tắc	Mô tả chi tiết	Liên kết UC
BR-01	Kinh tế đóng	Tiền (Gold) chỉ được sinh ra khi tiêu diệt quái hoặc hoàn thành Wave. Tiền này không thể rút ra ngoài màn chơi.	UC-01, UC-02
BR-02	Bảo toàn vị trí	Một ô đất (Grid) chỉ được chứa tối đa 1 trụ. Không được phép đặt chồng lấp trừ khi có tính năng đặc biệt.	UC-01
BR-03	Khấu hao bán trụ	Nếu người chơi bán trụ (ngoài UC-01/02), chỉ hoàn lại tối đa 70% giá trị gốc để tránh việc lạm dụng thay đổi chiến thuật quá dễ dàng.	UC-01
BR-04	Quản lý thất bại	Khi HP Base chạm mức 0, người chơi phải được cung cấp lựa chọn "Hồi sinh" (xem quảng cáo) hoặc "Thua cuộc" để bảo vệ doanh thu.	UC-05
BR-05	Tiến trình kỹ năng	Các kỹ năng đặc biệt (UC-04) phải có thời gian hồi (Cooldown) đủ lâu để không làm mất đi tính chiến thuật của trụ.	UC-04
3. Phạm vi giải pháp (Solution Scope)
Để đáp ứng các User Case, hệ thống phần mềm cần có:
Core Engine: Xử lý va chạm (Collision), tìm đường (Pathfinding cho quái), và hệ thống đạn (Projectile).
Data Driven System: Toàn bộ thông số trụ (Damage, Range - UC-02) và quái (HP, Speed - UC-03) phải được quản lý qua file cấu hình (JSON/Excel) để dễ dàng cân bằng (Re-balance) mà không cần can thiệp vào code core.
Reward System: Cơ chế tính toán phần thưởng (sao, tiền, vật phẩm) dựa trên lượng HP còn lại của Base khi kết thúc màn chơi.
4. Chỉ số đo lường thành công (Success Metrics/KPIs)
Với tư cách là BA, bạn sẽ đo lường hiệu quả của các UC đã thiết kế qua:
Average Wave Reached: Người chơi trung bình đạt đến wave bao nhiêu? (Nếu quá thấp -> Game quá khó; nếu quá cao -> Game quá dễ).
Gold Sink Ratio: Tỷ lệ người chơi tiêu tiền để nâng cấp trụ (UC-02) so với việc đặt trụ mới (UC-01).
Skill Usage Frequency: Tần suất sử dụng kỹ năng đặc biệt (UC-04) để đánh giá độ hữu dụng của kỹ năng.
Churn Rate per Level: Tỷ lệ người chơi bỏ game tại một Level cụ thể (thường liên quan đến UC-05).
