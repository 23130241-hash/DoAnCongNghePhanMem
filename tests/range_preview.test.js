/* eslint-env node, jest */
/**
 * Unit tests — UC03: Range Preview & Ghost Tower
 */
const { loadSource } = require('./helpers/load-source');

// ----- Mock DOM & Dependencies -----
const mockCanvas = {
    getContext: jest.fn(() => ({
        clearRect: jest.fn(),
        fillRect: jest.fn(),
        beginPath: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        fillText: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        setLineDash: jest.fn(),
        ellipse: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
    })),
    getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
    classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false), toggle: jest.fn() },
    dataset: {},
    style: {},
    querySelector: jest.fn(() => ({ innerText: '' })),
    innerText: '',
    width: 800,
    height: 600,
};

global.document = {
    getElementById: jest.fn((id) => {
        if (id === 'gameCanvas') return mockCanvas;
        return {
            dataset: {},
            classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false), toggle: jest.fn() },
            querySelector: jest.fn(() => ({ innerText: '' })),
            style: {},
            onclick: null
        };
    }),
    querySelectorAll: jest.fn(() => []),
};

global.window = { onload: null };
global.Save_Manager = { load: jest.fn(), addStars: jest.fn() };
global.Game_Manager = { 
    isPaused: false, isGameOver: false, isVictory: false, towers: [], enemies: [], projectiles: [], explosions: [],
    updateGameLoop: jest.fn(),
    isSpeedUnlocked: jest.fn(() => true),
    stopGameLoop: jest.fn(),
    _clearAllTimers: jest.fn(),
};
global.Player_Stats = { 
    hp: 20, maxHp: 20, money: 200, wave: 0, maxWaves: 3, 
    checkMoney: jest.fn(() => true) 
};
global.Map_Grid = { 
    mapId: 'map01', paths: [], buildSpots: [], base: null,
    path: [],
    checkValidPosition: jest.fn(() => ({ spot: { x: 100, y: 100 }, valid: true })),
    isSpotOccupied: jest.fn(() => false)
};
global.Wave_Manager = { startLevel: jest.fn(), reset: jest.fn() };
global.requestAnimationFrame = jest.fn();
global.cancelAnimationFrame = jest.fn();

loadSource('src/core/config.js', ['GAME_CONFIG']);
loadSource('src/core/game.js', ['UI_Manager']);

describe('UC03 - Range Preview & Ghost Tower', () => {
    
    beforeEach(() => {
        UI_Manager.canvas = mockCanvas;
        UI_Manager.ctx = mockCanvas.getContext('2d');
        UI_Manager.selectedTowerSlot = null;
        UI_Manager.mouseX = 0;
        UI_Manager.mouseY = 0;
        jest.clearAllMocks();
    });

    test('Logic Range Preview cập nhật mouseX và mouseY khi mousemove', () => {
        UI_Manager._bindCanvasHover();
        
        const event = { clientX: 200, clientY: 300 };
        mockCanvas.onmousemove(event);
        
        expect(UI_Manager.mouseX).toBe(200);
        expect(UI_Manager.mouseY).toBe(300);
    });

    test('Gán hoverBuildSpot khi đang trong chế độ xây dựng', () => {
        // Giả lập trạng thái đang chọn tháp
        UI_Manager.selectedTowerSlot = { type: 'archer' };
        UI_Manager._bindCanvasHover();
        
        const event = { clientX: 100, clientY: 100 };
        mockCanvas.onmousemove(event);
        
        // Kiểm tra xem Map_Grid có được gọi để check snap không
        expect(Map_Grid.checkValidPosition).toHaveBeenCalled();
        expect(UI_Manager.hoverBuildSpot).not.toBeNull();
        expect(UI_Manager.hoverBuildSpot.spot.x).toBe(100);
    });

    test('Xóa preview khi chuột rời canvas', () => {
        UI_Manager._bindCanvasHover();
        mockCanvas.onmouseleave();
        
        expect(UI_Manager.mouseX).toBe(-1000);
        expect(UI_Manager.hoverBuildSpot).toBeNull();
    });
});
