/**
 * Unit tests — Wave_Manager (UC09 — Sinh kẻ thù)
 *
 * Chiến lược test:
 *   - Mock các dependency của Wave_Manager (Game_Manager, Player_Stats, UI_Manager,
 *     Map_Grid, Enemy, currentLevel) trước khi load source.
 *   - Load config.js để có GAME_CONFIG.ENEMIES (cần cho _isBossWave).
 *   - Load wave_manager.js → expose Wave_Manager global.
 *   - Test 3 hàm pure dễ kiểm soát nhất: getWaveTotalCount, _isBossWave,
 *     và validate cấu hình config.js (đảm bảo data hợp lệ).
 */
const { loadSource } = require('./helpers/load-source');

// ----- Mock dependencies BEFORE loading sources -----
global.Game_Manager = {
    enemies: [],
    isPaused: false,
    isGameOver: false,
    isPlaying: true,
};
global.Player_Stats = {
    wave: 0,
    maxWaves: 3,
    initFromLevel: jest.fn(),
};
global.UI_Manager = {
    updateUI: jest.fn(),
};
global.Map_Grid = {
    path: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
};
global.currentLevel = 1;
// Stub Enemy class
global.Enemy = class Enemy {
    constructor(cfg) { Object.assign(this, cfg); }
};

// Load config.js → expose GAME_CONFIG
loadSource('config.js', ['GAME_CONFIG']);
// Load wave_manager.js → expose Wave_Manager
loadSource('wave_manager.js', ['Wave_Manager']);

// =====================================================================
describe('Wave_Manager.getWaveTotalCount', () => {

    test('trả về 0 nếu waveData là null/undefined', () => {
        expect(Wave_Manager.getWaveTotalCount(null)).toBe(0);
        expect(Wave_Manager.getWaveTotalCount(undefined)).toBe(0);
    });

    test('trả về count cho format cũ { enemyType, count, interval }', () => {
        expect(Wave_Manager.getWaveTotalCount({ enemyType: 'creep', count: 10, interval: 1000 })).toBe(10);
        expect(Wave_Manager.getWaveTotalCount({ enemyType: 'tank', count: 5 })).toBe(5);
    });

    test('cộng dồn count của tất cả group cho format groups', () => {
        const wave = {
            groups: [
                { enemyType: 'skeleton', count: 8 },
                { enemyType: 'fast_creep', count: 10 },
                { enemyType: 'tank', count: 4 },
            ]
        };
        expect(Wave_Manager.getWaveTotalCount(wave)).toBe(8 + 10 + 4);
    });

    test('xử lý group thiếu count (coi như 0)', () => {
        const wave = { groups: [{ enemyType: 'creep', count: 5 }, { enemyType: 'tank' }] };
        expect(Wave_Manager.getWaveTotalCount(wave)).toBe(5);
    });

    test('trả về 0 nếu groups là mảng rỗng', () => {
        expect(Wave_Manager.getWaveTotalCount({ groups: [] })).toBe(0);
    });
});

// =====================================================================
describe('Wave_Manager._isBossWave', () => {

    test('false cho wave không xác định', () => {
        expect(Wave_Manager._isBossWave(null)).toBe(false);
        expect(Wave_Manager._isBossWave(undefined)).toBe(false);
    });

    test('false cho wave thường (creep / scout / tank / skeleton)', () => {
        expect(Wave_Manager._isBossWave({ enemyType: 'creep', count: 10 })).toBe(false);
        expect(Wave_Manager._isBossWave({ enemyType: 'fast_creep', count: 10 })).toBe(false);
        expect(Wave_Manager._isBossWave({ enemyType: 'tank', count: 5 })).toBe(false);
        expect(Wave_Manager._isBossWave({ enemyType: 'skeleton', count: 12 })).toBe(false);
    });

    test('true cho wave có enemyType là boss', () => {
        expect(Wave_Manager._isBossWave({ enemyType: 'boss', count: 1 })).toBe(true);
    });

    test('true nếu một group bất kỳ chứa boss', () => {
        const wave = {
            groups: [
                { enemyType: 'creep', count: 5 },
                { enemyType: 'boss', count: 1 },
            ]
        };
        expect(Wave_Manager._isBossWave(wave)).toBe(true);
    });

    test('false nếu groups không có boss nào', () => {
        const wave = {
            groups: [
                { enemyType: 'skeleton', count: 8 },
                { enemyType: 'tank', count: 4 },
            ]
        };
        expect(Wave_Manager._isBossWave(wave)).toBe(false);
    });
});

// =====================================================================
describe('Wave_Manager state lifecycle', () => {

    test('reset() đưa toàn bộ state về 0/null', () => {
        // Set state có giá trị
        Wave_Manager.waveTimer = 5000;
        Wave_Manager.spawnTimer = 1000;
        Wave_Manager.enemiesSpawnedThisWave = 8;
        Wave_Manager.countdownTimer = 700;
        Wave_Manager.countdownNumber = 2;
        Wave_Manager.bannerTimer = 1500;
        Wave_Manager.groupIndex = 1;
        Wave_Manager.groupSpawnedCount = 3;
        Wave_Manager.currentBoss = { hp: 100 };

        Wave_Manager.reset();

        expect(Wave_Manager.waveTimer).toBe(0);
        expect(Wave_Manager.spawnTimer).toBe(0);
        expect(Wave_Manager.enemiesSpawnedThisWave).toBe(0);
        expect(Wave_Manager.countdownTimer).toBe(0);
        expect(Wave_Manager.countdownNumber).toBe(0);
        expect(Wave_Manager.bannerTimer).toBe(0);
        expect(Wave_Manager.groupIndex).toBe(0);
        expect(Wave_Manager.groupSpawnedCount).toBe(0);
        expect(Wave_Manager.currentBoss).toBeNull();
    });

    test('startLevel() set waveTimer = firstWaveDelay', () => {
        Wave_Manager.startLevel(1);
        expect(Wave_Manager.waveTimer).toBe(GAME_CONFIG.GAMEPLAY.firstWaveDelay);
    });

    test('update(dt) return sớm khi isPaused', () => {
        Wave_Manager.startLevel(1);
        const before = Wave_Manager.waveTimer;
        Game_Manager.isPaused = true;
        Wave_Manager.update(16.67);
        expect(Wave_Manager.waveTimer).toBe(before);   // không bị giảm
        Game_Manager.isPaused = false;
    });

    test('update(dt) return sớm khi isGameOver', () => {
        Wave_Manager.startLevel(1);
        const before = Wave_Manager.waveTimer;
        Game_Manager.isGameOver = true;
        Wave_Manager.update(16.67);
        expect(Wave_Manager.waveTimer).toBe(before);
        Game_Manager.isGameOver = false;
    });
});

// =====================================================================
describe('GAME_CONFIG validation (config.js)', () => {

    test('CONFIG đã định nghĩa các nhóm MAPS / ENEMIES / TOWERS / LEVELS / GAMEPLAY', () => {
        expect(GAME_CONFIG.MAPS).toBeDefined();
        expect(GAME_CONFIG.ENEMIES).toBeDefined();
        expect(GAME_CONFIG.TOWERS).toBeDefined();
        expect(GAME_CONFIG.LEVELS).toBeDefined();
        expect(GAME_CONFIG.GAMEPLAY).toBeDefined();
    });

    test('Mỗi map có path, buildSpots, base với cấu trúc hợp lệ', () => {
        for (const [mapId, map] of Object.entries(GAME_CONFIG.MAPS)) {
            expect(Array.isArray(map.path)).toBe(true);
            expect(map.path.length).toBeGreaterThanOrEqual(2);
            expect(Array.isArray(map.buildSpots)).toBe(true);
            expect(map.base).toBeDefined();
            expect(typeof map.base.x).toBe('number');
            expect(typeof map.base.y).toBe('number');
            // Mỗi waypoint phải có x, y
            map.path.forEach(pt => {
                expect(typeof pt.x).toBe('number');
                expect(typeof pt.y).toBe('number');
            });
        }
    });

    test('Mỗi enemy có hp, speed, damage, reward dương', () => {
        for (const [type, stats] of Object.entries(GAME_CONFIG.ENEMIES)) {
            expect(stats.hp).toBeGreaterThan(0);
            expect(stats.speed).toBeGreaterThan(0);
            expect(stats.damage).toBeGreaterThan(0);
            expect(stats.reward).toBeGreaterThanOrEqual(0);
        }
    });

    test('Mỗi level có mapId tham chiếu hợp lệ trong MAPS', () => {
        for (const [lvlId, lvl] of Object.entries(GAME_CONFIG.LEVELS)) {
            expect(GAME_CONFIG.MAPS[lvl.mapId]).toBeDefined();
        }
    });

    test('Mỗi wave có enemyType (cũ) HOẶC groups (mới) — không thiếu cả 2', () => {
        for (const [lvlId, lvl] of Object.entries(GAME_CONFIG.LEVELS)) {
            lvl.waves.forEach((wave, idx) => {
                const hasOld = typeof wave.enemyType === 'string';
                const hasNew = Array.isArray(wave.groups);
                expect(hasOld || hasNew).toBe(true);
            });
        }
    });

    test('BR-03: Chi phí nâng cấp tháp ≥ 1.5x cấp trước', () => {
        for (const [tType, def] of Object.entries(GAME_CONFIG.TOWERS)) {
            if (!def.levels || !Array.isArray(def.levels)) continue;
            for (let i = 1; i < def.levels.length; i++) {
                const prev = def.levels[i - 1].cost;
                const cur = def.levels[i].cost;
                expect(cur).toBeGreaterThanOrEqual(prev * 1.5);
            }
        }
    });

    test('Skeleton enemy được định nghĩa với chỉ số đúng (UC09 mở rộng)', () => {
        expect(GAME_CONFIG.ENEMIES.skeleton).toBeDefined();
        expect(GAME_CONFIG.ENEMIES.skeleton.hp).toBe(60);
        expect(GAME_CONFIG.ENEMIES.skeleton.damage).toBe(2);
    });

    test('Boss enemy có flag isBoss = true', () => {
        expect(GAME_CONFIG.ENEMIES.boss).toBeDefined();
        expect(GAME_CONFIG.ENEMIES.boss.isBoss).toBe(true);
    });

    test('Level 3 sử dụng map03 và có wave format groups', () => {
        const lvl3 = GAME_CONFIG.LEVELS[3];
        expect(lvl3).toBeDefined();
        expect(lvl3.mapId).toBe('map03');
        // Phải có ít nhất 1 wave dùng groups
        const hasGroups = lvl3.waves.some(w => Array.isArray(w.groups));
        expect(hasGroups).toBe(true);
    });
});
