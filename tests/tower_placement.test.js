/* eslint-env node, jest */
/**
 * Unit tests — UC05: Đặt tháp và hiệu ứng hiển thị khi đặt thành công
 */
const { loadSource } = require('./helpers/load-source');

// Mô phỏng DOM tối thiểu
const mockCanvas = {
    getContext: jest.fn(() => ({
        clearRect: jest.fn(), fillRect: jest.fn(), beginPath: jest.fn(), arc: jest.fn(),
        fill: jest.fn(), stroke: jest.fn(), fillText: jest.fn(), save: jest.fn(),
        restore: jest.fn(), setLineDash: jest.fn(), ellipse: jest.fn(),
        moveTo: jest.fn(), lineTo: jest.fn(), strokeText: jest.fn()
    })),
    getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
    classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false), toggle: jest.fn() },
    dataset: {}, style: {}, querySelector: jest.fn(() => ({ innerText: '' })),
    width: 900, height: 600,
};

global.document = {
    getElementById: jest.fn((id) => (id === 'gameCanvas' ? mockCanvas : { 
        dataset: {}, classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
        style: {}, onclick: null, querySelector: jest.fn(() => ({ innerText: '' })), innerText: ''
    })),
    querySelectorAll: jest.fn(() => []),
};

global.window = { onload: null };
global.Save_Manager = { load: jest.fn() };
global.requestAnimationFrame = jest.fn();

// Cung cấp Map_Grid và Player_Stats nhẹ để test điều khiển
global.Map_Grid = {
    checkValidPosition: jest.fn(() => ({ spot: { x: 100, y: 100 }, valid: true })),
    markOccupied: jest.fn()
};

global.Player_Stats = {
    checkMoney: jest.fn(() => true),
    deductMoney: jest.fn(),
};

// Nạp config và game, expose Game_Manager & UI_Manager
loadSource('src/core/config.js', ['GAME_CONFIG']);
loadSource('src/core/game.js', ['Game_Manager', 'UI_Manager']);

describe('UC05 - Tower Placement', () => {
    beforeEach(() => {
        // Reset lại trạng thái
        Game_Manager.towers = [];
        Game_Manager.placementEffects = [];
        jest.clearAllMocks();
        // Stub các tương tác UI để tránh phụ thuộc DOM khi test
        UI_Manager.showError = jest.fn();
        UI_Manager.updateUI = jest.fn();
        UI_Manager.clearSelected = jest.fn();
    });

    /**
     * Kiểm thử luồng chính: Thỏa mãn mọi bước trong Sequence Diagram (Vị trí OK, Tiền OK)
     * Mong đợi: Khởi tạo tháp (step 10), trừ tiền (step 11), chiếm ô (step 12), báo thành công (step 13).
     */
    test('Game_Manager.requestBuildTower: Xây tháp thành công khi đủ tiền và đúng vị trí', () => {
        Player_Stats.checkMoney.mockReturnValue(true);
        Map_Grid.checkValidPosition.mockReturnValue({ spot: { x: 100, y: 100 }, valid: true });

        const result = Game_Manager.requestBuildTower(100, 100, 'archer');

        expect(result).toBe(true);
        expect(Game_Manager.towers.length).toBe(1);
        expect(Game_Manager.placementEffects.length).toBe(1); // Kiểm tra hiệu ứng (commit fix(ux))
        expect(Map_Grid.markOccupied).toHaveBeenCalledWith(100, 100);
        expect(UI_Manager.updateUI).toHaveBeenCalled();
    });

    /**
     * Kiểm thử luồng rẽ nhánh: Không đủ tiền (Sequence Step #9)
     * Mong đợi: Không xây được tháp, báo lỗi màu vàng.
     */
    test('Game_Manager.requestBuildTower: Thất bại khi không đủ tiền', () => {
        Player_Stats.checkMoney.mockReturnValue(false);
        Map_Grid.checkValidPosition.mockReturnValue({ spot: { x: 100, y: 100 }, valid: true });

        const result = Game_Manager.requestBuildTower(100, 100, 'archer');

        expect(result).toBe(false);
        expect(Game_Manager.towers.length).toBe(0);
        expect(Game_Manager.placementEffects.length).toBe(0);
        expect(UI_Manager.showError).toHaveBeenCalledWith(expect.any(String), "#f1c40f"); // Màu vàng cam (Yellowish)
    });
});
