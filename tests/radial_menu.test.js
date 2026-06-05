/* eslint-env node, jest */
/**
 * Unit tests — UC03: Horizontal Build Menu
 * File này được CircleCI sử dụng để kiểm tra tự động.
 *
 * Chiến lược: Kiểm tra trực tiếp các phương thức logic của UI_Manager
 * thay vì phụ thuộc vào cách hàm gọi DOM, để ổn định trong môi trường CI.
 */
const { loadSource } = require('./helpers/load-source');

// ----- Mock Canvas -----
const mockCanvas = {
    getContext: jest.fn(() => ({
        clearRect: jest.fn(), fillRect: jest.fn(), beginPath: jest.fn(),
        arc: jest.fn(), fill: jest.fn(), stroke: jest.fn(), fillText: jest.fn(),
        save: jest.fn(), restore: jest.fn(), setLineDash: jest.fn(),
    })),
    getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
    classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false), toggle: jest.fn() },
    style: {}
};

// ----- Mock Radial Menu element -----
const mockRadialMenu = {
    style: {},
    classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) },
};

// ----- Mock container chứa các item tháp -----
const mockRadialContainer = {
    innerHTML: '',
    appendChild: jest.fn(),
};

global.document = {
    getElementById: jest.fn((id) => {
        if (id === 'gameCanvas')             return mockCanvas;
        if (id === 'radial-menu')            return mockRadialMenu;
        if (id === 'radial-items-container') return mockRadialContainer;
        return {
            dataset: {}, style: {}, onclick: null, innerHTML: '',
            classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn(), contains: jest.fn(() => false) },
            querySelector: jest.fn(() => ({ innerText: '' })),
        };
    }),
    querySelectorAll: jest.fn(() => []),
    querySelector: jest.fn(() => ({ classList: { contains: jest.fn(() => false) } })),
    createElement: jest.fn(() => ({
        style: { setProperty: jest.fn() },
        classList: { add: jest.fn() },
        innerHTML: '',
        onclick: null
    }))
};

global.window = { onload: null };
global.Save_Manager = { load: jest.fn() };
global.Game_Manager = {
    isPaused: false, isGameOver: false, isVictory: false,
    towers: [], enemies: [], projectiles: [], explosions: [],
    requestBuildTower: jest.fn(),
    isSpeedUnlocked: jest.fn(() => true),
    stopGameLoop: jest.fn(),
    _clearAllTimers: jest.fn(),
};
global.Player_Stats = {
    hp: 20, maxHp: 20, money: 200, wave: 0, maxWaves: 3,
    checkMoney: jest.fn(() => true)
};
global.Map_Grid = {
    checkValidPosition: jest.fn(() => ({ spot: { x: 100, y: 100 }, valid: true })),
};
global.requestAnimationFrame = jest.fn();
global.cancelAnimationFrame = jest.fn();

loadSource('src/core/config.js', ['GAME_CONFIG']);
loadSource('src/core/game.js', ['UI_Manager']);

describe('UC03 - Horizontal Menu Logic', () => {

    beforeEach(() => {
        // Gán mock vào UI_Manager TRƯỚC mỗi test
        UI_Manager.canvas = mockCanvas;
        UI_Manager.radialMenu = mockRadialMenu;
        UI_Manager.activeRadialSpot = null;
        jest.clearAllMocks();
    });

    // ----------------------------------------------------------------
    // TEST 1: hideRadialMenu phải thêm class 'hidden' vào menu
    // ----------------------------------------------------------------
    test('hideRadialMenu ẩn menu bằng class hidden', () => {
        UI_Manager.hideRadialMenu();
        expect(mockRadialMenu.classList.add).toHaveBeenCalledWith('hidden');
    });

    // ----------------------------------------------------------------
    // TEST 2: hideRadialMenu xóa activeRadialSpot (reset state)
    // ----------------------------------------------------------------
    test('hideRadialMenu reset activeRadialSpot về null', () => {
        UI_Manager.activeRadialSpot = { x: 100, y: 200 };
        UI_Manager.hideRadialMenu();
        expect(UI_Manager.activeRadialSpot).toBeNull();
    });

    // ----------------------------------------------------------------
    // TEST 3: showRadialMenu lưu lại Build Spot vào activeRadialSpot.
    //         Đây là side-effect đảm bảo flow "chọn spot → mở menu" đúng.
    // ----------------------------------------------------------------
    test('showRadialMenu lưu lại activeRadialSpot đúng với spot được truyền', () => {
        const spot = { x: 250, y: 300 };
        UI_Manager.showRadialMenu(spot.x, spot.y, spot);
        // activeRadialSpot được set TRƯỚC khi guard check → luôn đúng
        expect(UI_Manager.activeRadialSpot).toBe(spot);
        expect(UI_Manager.activeRadialSpot.x).toBe(250);
    });
});
