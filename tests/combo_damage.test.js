/**
 * Unit tests — ComboDamage (UC11 — Xử lý Combo Damage Tick)
 *
 * Chiến lược test dựa trên wave_manager.test.js:
 * - Mock các dependency toàn cục (GAME_CONFIG, Enemy, reduceBaseHP, checkGameOver, UI_Manager, v.v.) trước khi load source.
 * - Load combo_damge.js (file hiện tại đang đặt tên là combo_damge.js) → expose ComboDamageQueue, ComboDamage ra global.
 * - Test các hàm chức năng chính: enqueue, flushQueue, và cơ chế tính toán gộp sát thương (Combo).
 */

// ----- Mock dependencies BEFORE loading sources -----
global.GAME_CONFIG = {
    ENEMIES: {
        fast_creep: { hp: 15, damage: 1 },
        skeleton:   { hp: 60, damage: 2 },
        tank:       { hp: 120, damage: 3 },
        boss:       { hp: 400, damage: 5 }
    }
};

// Stub class Enemy
global.Enemy = class Enemy {
    constructor(cfg) {
        Object.assign(this, cfg);
    }
};

// Mock các hàm điều khiển trạng thái Game toàn cục mà combo_damge.js tương tác
global.reduceBaseHP = jest.fn();
global.checkGameOver = jest.fn(() => false);
global.stopGameLoop = jest.fn();

// Giả lập UI_Manager nếu code của bạn có tương tác cập nhật giao diện hiển thị combo
global.UI_Manager = {
    showDamageAlert: jest.fn(),
    updateUI: jest.fn()
};

// Sử dụng helper tương tự như bên wave_manager để load source code
// Nếu dự án của bạn chưa có loadSource trong helpers, hãy đảm bảo đường dẫn chuẩn xác.
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    // Nạp file combo_damge.js vào môi trường test toàn cục
    // Lưu ý: Điền đúng tên file thực tế của bạn đang là 'combo_damge.js'
    loadSource('combo_damge.js');
});

beforeEach(() => {
    // Reset các mock function trước mỗi case test để không bị cộng dồn số lần gọi (toHaveBeenCalledTimes)
    jest.clearAllMocks();

    // Đảm bảo Queue trống trước khi làm test mới
    if (global.ComboDamageQueue && typeof global.ComboDamageQueue.clear === 'function') {
        global.ComboDamageQueue.clear();
    } else if (global.ComboDamageQueue) {
        global.ComboDamageQueue.items = [];
    }
});

describe('UC11: Alternative Flow — Combo Damage Queue Tests', () => {

    test('BR-Combo-01: Thêm quái vật vào Queue thành công (enqueue)', () => {
        const mockEnemy = {
            type: 'fast_creep',
            damage: 1,
            hp: 15
        };

        global.ComboDamageQueue.enqueue(mockEnemy);

        // Kiểm tra xem phần tử đã lọt vào hàng đợi chưa
        expect(global.ComboDamageQueue.items.length).toBe(1);
        expect(global.ComboDamageQueue.items[0].type).toBe('fast_creep');
    });

    test('BR-Combo-02: Flush Queue gom sát thương của nhiều quái vật chạm căn cứ cùng frame', () => {
        // Giả lập 3 con 'fast_creep' chạm căn cứ cùng lúc (mỗi con gây 1 damage)
        const enemy1 = { type: 'fast_creep', damage: 1 };
        const enemy2 = { type: 'fast_creep', damage: 1 };
        const enemy3 = { type: 'fast_creep', damage: 1 };

        global.ComboDamageQueue.enqueue(enemy1);
        global.ComboDamageQueue.enqueue(enemy2);
        global.ComboDamageQueue.enqueue(enemy3);

        // Kích hoạt giải phóng hàng đợi để xử lý combo gộp sát thương
        global.ComboDamageQueue.flushQueue();

        // Kiểm tra xem hàm trừ máu tổng `reduceBaseHP` có được gọi với tổng damage = 3 (1+1+1) hay không
        // Thay đổi dòng này cho khớp với hàm xử lý thực tế trong combo_damge.js của bạn
        expect(global.reduceBaseHP).toHaveBeenCalledWith(3);

        // Hàng đợi phải được dọn sạch sau khi flush
        expect(global.ComboDamageQueue.items.length).toBe(0);
    });

    test('BR-Combo-03: Hàm mô phỏng simulate() tạo đúng số lượng quái và flush chính xác', () => {
        // Kiểm tra hàm ComboDamage.simulate lấy từ window/global
        expect(global.ComboDamage).toBeDefined();
        expect(typeof global.ComboDamage.simulate).toBe('module' || 'function');

        // Chạy hàm mô phỏng với 3 quái vật hệ 'fast_creep'
        global.ComboDamage.simulate('fast_creep', 3);

        // Sau khi chạy xong simulate, hệ thống đã nạp và flush ngay lập tức
        // Kiểm tra xem reduceBaseHP có nhận đủ 3 damage không
        expect(global.reduceBaseHP).toHaveBeenCalledWith(3);
    });

    test('BR-Combo-04: Báo lỗi hoặc không thực hiện nếu enemyType truyền vào không tồn tại trong cấu hình', () => {
        // Giả lập ghi nhận log lỗi từ console
        const spyConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        global.ComboDamage.simulate('quai_vat_la_unknown', 2);

        // Hàm không được tính damage vì quái vật không có trong GAME_CONFIG
        expect(global.reduceBaseHP).not.toHaveBeenCalled();
        expect(spyConsoleError).toHaveBeenCalled();

        spyConsoleError.mockRestore();
    });
});