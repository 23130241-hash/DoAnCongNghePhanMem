/* eslint-env node, jest */

const { loadSource } = require('./helpers/load-source');

window.addEventListener = jest.fn();

loadSource('src/core/config.js', ['GAME_CONFIG']);
loadSource('src/managers/upgrade_system.js', [
    'TOWER_SHOP_CATALOG',
    'Upgrade_System'
]);

function setupDOM() {
    document.body.innerHTML = `
        <div id="tower-slots">
            <button class="slot active" data-type="archer" data-cost="50">
                <span class="icon">🏹</span>
                <span class="cost">50g</span>
            </button>
            <button class="slot active" data-type="cannon" data-cost="100">
                <span class="icon">💣</span>
                <span class="cost">100g</span>
            </button>
            <button class="slot active" data-type="magic" data-cost="80">
                <span class="icon">🔮</span>
                <span class="cost">80g</span>
            </button>
            <button class="slot locked">
                <span class="icon">🔒</span>
                <span class="cost">---</span>
            </button>
            <button class="slot locked">
                <span class="icon">🔒</span>
                <span class="cost">---</span>
            </button>
        </div>

        <div id="upgrade-screen">
            <div id="upgrade-tree-view"></div>
            <div id="upgrade-details" class="hidden"></div>
            <div id="up-name"></div>
            <div id="up-desc"></div>
            <div id="up-cost"></div>
            <button id="confirm-upgrade-btn"></button>
        </div>
    `;
}

beforeEach(() => {
    setupDOM();

    global.Save_Manager = {
        load: jest.fn(),
        save: jest.fn()
    };

    global.UI_Manager = {
        clearSelected: jest.fn(),
        _bindTowerSlots: jest.fn()
    };

    GAME_CONFIG.SAVE_DATA = {
        totalStars: 10,
        unlockedUpgrades: [],
        completedLevels: {}
    };

    delete GAME_CONFIG.TOWERS.poison;
    delete GAME_CONFIG.TOWERS.sniper;

    jest.clearAllMocks();
});

describe('UC22: Upgrade_System — mở khóa tháp', () => {
    test('applyUnlockedSlots không nhân thêm slot tháp đã mở khóa khi gọi nhiều lần', () => {
        GAME_CONFIG.SAVE_DATA.unlockedUpgrades = ['poison'];

        Upgrade_System.applyUnlockedSlots();
        Upgrade_System.applyUnlockedSlots();

        const poisonSlots = document.querySelectorAll(
            '#tower-slots .slot[data-type="poison"]'
        );

        expect(poisonSlots.length).toBe(1);
    });

    test('_unlockTower tự khởi tạo unlockedUpgrades nếu save cũ chưa có', () => {
        GAME_CONFIG.SAVE_DATA.totalStars = 10;
        delete GAME_CONFIG.SAVE_DATA.unlockedUpgrades;

        Upgrade_System._unlockTower('poison');

        expect(GAME_CONFIG.SAVE_DATA.unlockedUpgrades).toContain('poison');
        expect(GAME_CONFIG.TOWERS.poison).toBeDefined();
        expect(GAME_CONFIG.SAVE_DATA.totalStars).toBe(5);
        expect(Save_Manager.save).toHaveBeenCalled();
    });
});