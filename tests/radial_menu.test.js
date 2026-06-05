/* eslint-env node, jest */
/**
 * Unit tests — UC03: Horizontal Build Menu (Updated)
 */
const { loadSource } = require('./helpers/load-source');

// ----- Mock DOM -----
const mockCanvas = {
    getContext: jest.fn(() => ({})),
    getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
    classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false), toggle: jest.fn() },
    style: {}
};

const mockRadialMenu = {
    style: { left: '0px', top: '0px' },
    classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) },
};

const mockRadialContainer = {
    innerHTML: '',
    appendChild: jest.fn(),
};

global.document = {
    getElementById: jest.fn((id) => {
        if (id === 'gameCanvas') return mockCanvas;
        if (id === 'radial-menu') return mockRadialMenu;
        if (id === 'radial-items-container') return mockRadialContainer;
        return { 
            dataset: {}, classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn(), contains: jest.fn(() => false) },
            style: {}, onclick: null, querySelector: jest.fn(() => ({ innerText: '' })),
            innerHTML: ''
        };
    }),
    querySelectorAll: jest.fn((selector) => {
        return [
            { dataset: { type: 'archer' }, classList: { contains: jest.fn(() => false) } },
            { dataset: { type: 'cannon' }, classLine: { contains: jest.fn(() => false) } }
        ];
    }),
    querySelector: jest.fn((selector) => {
        return { classList: { contains: jest.fn(() => false) } };
    }),
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
    requestBuildTower: jest.fn()
};
global.Player_Stats = { checkMoney: jest.fn(() => true) };
global.Map_Grid = { 
    checkValidPosition: jest.fn(() => ({ spot: { x: 100, y: 100 }, valid: true })),
};
global.requestAnimationFrame = jest.fn();
global.cancelAnimationFrame = jest.fn();

loadSource('src/core/config.js', ['GAME_CONFIG']);
loadSource('src/core/game.js', ['UI_Manager']);

describe('UC03 - Horizontal Menu Logic', () => {
    
    beforeEach(() => {
        UI_Manager.canvas = mockCanvas;
        UI_Manager.radialMenu = mockRadialMenu;
        jest.clearAllMocks();
    });

    test('showRadialMenu cập nhật trạng thái menu ngang', () => {
        const spot = { x: 150, y: 200 };
        UI_Manager.showRadialMenu(spot.x, spot.y, spot);
        
        expect(mockRadialMenu.classList.remove).toHaveBeenCalledWith('hidden');
        expect(mockRadialMenu.style.left).toBe('150px');
        expect(mockRadialMenu.style.top).toBe('200px');
    });

    test('hideRadialMenu ẩn menu', () => {
        UI_Manager.hideRadialMenu();
        expect(mockRadialMenu.classList.add).toHaveBeenCalledWith('hidden');
    });
});
