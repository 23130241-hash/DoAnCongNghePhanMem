/* eslint-env node, jest */
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
 *
 * Note: Dòng `eslint-env` trên cùng báo cho IntelliJ + ESLint biết file này
 * chạy trong môi trường Node (cho `global`, `require`) + Jest (cho `jest`,
 * `describe`, `test`, `expect`) → các warning "Unresolved variable" biến mất.
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
// [Commit 17] Mock paths[] thay vì path (cấu trúc mới hỗ trợ multi-path)
global.Map_Grid = {
    paths: [
        // Path 0 — đường mặc định cho wave format cũ
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        // Path 1 — đường thứ 2 cho wave có pathIndex:1
        [{ x: 500, y: 500 }, { x: 500, y: 100 }, { x: 100, y: 100 }],
    ],
    // Giữ path getter cho code cũ (dù wave_manager test không dùng)
    get path() { return this.paths[0]; },
    getPath(idx = 0) { return this.paths[idx] || []; },
};
global.currentLevel = 1;
// Stub Enemy class
global.Enemy = class Enemy {
    constructor(cfg) { Object.assign(this, cfg); }
};

// Load config.js → expose GAME_CONFIG (path cập nhật sau refactor cấu trúc dự án)
loadSource('src/core/config.js', ['GAME_CONFIG']);
// Load wave_manager.js → expose Wave_Manager
loadSource('src/managers/wave_manager.js', ['Wave_Manager']);

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

    test('true cho wave có enemyType là boss1', () => {
        expect(Wave_Manager._isBossWave({ enemyType: 'boss1', count: 1 })).toBe(true);
    });

    test('true nếu một group bất kỳ chứa boss1', () => {
        const wave = {
            groups: [
                { enemyType: 'creep', count: 5 },
                { enemyType: 'boss1', count: 1 },
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

    // [Commit 18] Parallel format support
    test('true nếu một entry trong parallel chứa boss1', () => {
        const wave = {
            parallel: [
                { enemyType: 'creep', count: 10, pathIndex: 0 },
                { enemyType: 'boss1', count: 1, pathIndex: 1 },
            ]
        };
        expect(Wave_Manager._isBossWave(wave)).toBe(true);
    });

    test('false nếu parallel không có boss nào', () => {
        const wave = {
            parallel: [
                { enemyType: 'creep', count: 15, pathIndex: 0 },
                { enemyType: 'skeleton', count: 12, pathIndex: 1 },
            ]
        };
        expect(Wave_Manager._isBossWave(wave)).toBe(false);
    });
});

// =====================================================================
describe('Wave_Manager.getWaveTotalCount cho format parallel [Commit 18]', () => {

    test('cộng dồn count của tất cả sub-spawner', () => {
        const wave = {
            parallel: [
                { enemyType: 'creep',    count: 15, pathIndex: 0 },
                { enemyType: 'skeleton', count: 12, pathIndex: 1 },
                { enemyType: 'tank',     count: 3,  pathIndex: 0 },
            ]
        };
        expect(Wave_Manager.getWaveTotalCount(wave)).toBe(15 + 12 + 3);
    });

    test('parallel rỗng → trả về 0', () => {
        expect(Wave_Manager.getWaveTotalCount({ parallel: [] })).toBe(0);
    });

    test('parallel với entry thiếu count → coi như 0', () => {
        const wave = {
            parallel: [
                { enemyType: 'creep', count: 10, pathIndex: 0 },
                { enemyType: 'tank',  pathIndex: 1 },        // thiếu count
            ]
        };
        expect(Wave_Manager.getWaveTotalCount(wave)).toBe(10);
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
describe('Wave_Manager._spawnEnemy với pathIndex [Commit 17]', () => {

    beforeEach(() => {
        // Reset enemies list trước mỗi test
        Game_Manager.enemies = [];
        Wave_Manager.enemiesSpawnedThisWave = 0;
    });

    test('spawn KHÔNG truyền pathIndex → enemy.pathIndex = 0 (default)', () => {
        Wave_Manager._spawnEnemy('creep');
        const enemy = Game_Manager.enemies[0];
        expect(enemy.pathIndex).toBe(0);
        // Spawn position phải = path 0 start: (0, 0)
        expect(enemy.x).toBe(0);
        expect(enemy.y).toBe(0);
    });

    test('spawn với pathIndex=1 → enemy.pathIndex = 1, spawn ở start path 1', () => {
        Wave_Manager._spawnEnemy('creep', 1);
        const enemy = Game_Manager.enemies[0];
        expect(enemy.pathIndex).toBe(1);
        // Spawn position phải = path 1 start: (500, 500)
        expect(enemy.x).toBe(500);
        expect(enemy.y).toBe(500);
    });

    test('spawn với pathIndex không tồn tại → fallback về path 0', () => {
        Wave_Manager._spawnEnemy('creep', 99);
        const enemy = Game_Manager.enemies[0];
        // Fallback path 0 → spawn ở (0, 0), nhưng pathIndex giữ giá trị truyền vào
        // (tránh silent corrupt — code dùng `paths[99] || paths[0]` cho spawn point
        // nhưng pathIndex enemy vẫn = 99 để debug. Trong game thực Game_Manager
        // updateEnemyPosition cũng có fallback ?? 0)
        expect(enemy.x).toBe(0);
        expect(enemy.y).toBe(0);
    });

    test('enemy có pathIndex đúng khi spawn nhiều con liên tiếp ở 2 path khác nhau', () => {
        Wave_Manager._spawnEnemy('creep', 0);
        Wave_Manager._spawnEnemy('creep', 1);
        Wave_Manager._spawnEnemy('creep', 0);
        Wave_Manager._spawnEnemy('creep', 1);

        expect(Game_Manager.enemies[0].pathIndex).toBe(0);
        expect(Game_Manager.enemies[1].pathIndex).toBe(1);
        expect(Game_Manager.enemies[2].pathIndex).toBe(0);
        expect(Game_Manager.enemies[3].pathIndex).toBe(1);
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

    test('Mỗi map có paths, buildSpots, base với cấu trúc hợp lệ', () => {
        for (const [mapId, map] of Object.entries(GAME_CONFIG.MAPS)) {
            // [Commit 15] Format mới — paths là mảng các path
            expect(Array.isArray(map.paths)).toBe(true);
            expect(map.paths.length).toBeGreaterThanOrEqual(1);
            // Mỗi path phải có ≥ 2 waypoint và mỗi waypoint có x, y
            map.paths.forEach((path, pIdx) => {
                expect(Array.isArray(path)).toBe(true);
                expect(path.length).toBeGreaterThanOrEqual(2);
                path.forEach(pt => {
                    expect(typeof pt.x).toBe('number');
                    expect(typeof pt.y).toBe('number');
                });
            });
            expect(Array.isArray(map.buildSpots)).toBe(true);
            expect(map.base).toBeDefined();
            expect(typeof map.base.x).toBe('number');
            expect(typeof map.base.y).toBe('number');
        }
    });

    test('Map cũ không còn dùng property "path" (đã chuyển sang "paths")', () => {
        for (const [mapId, map] of Object.entries(GAME_CONFIG.MAPS)) {
            // Có thể tồn tại với value undefined (do destructure cũ), nhưng
            // KHÔNG được là array — nếu vẫn là array thì chưa migrate
            expect(Array.isArray(map.path)).toBe(false);
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

    test('Mỗi wave có enemyType (cũ) / groups / parallel — không thiếu cả 3', () => {
        for (const [lvlId, lvl] of Object.entries(GAME_CONFIG.LEVELS)) {
            lvl.waves.forEach((wave, idx) => {
                const hasOld      = typeof wave.enemyType === 'string';
                const hasGroups   = Array.isArray(wave.groups);
                const hasParallel = Array.isArray(wave.parallel);    // [Commit 18]
                expect(hasOld || hasGroups || hasParallel).toBe(true);
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

    test('Boss1 enemy có flag isBoss = true (đặt tên có hậu tố cho mở rộng boss2/3)', () => {
        expect(GAME_CONFIG.ENEMIES.boss1).toBeDefined();
        expect(GAME_CONFIG.ENEMIES.boss1.isBoss).toBe(true);
        // Đảm bảo key cũ 'boss' đã bị rename, không còn tồn tại
        expect(GAME_CONFIG.ENEMIES.boss).toBeUndefined();
    });

    test('Level 3 sử dụng map03 và có wave format groups', () => {
        const lvl3 = GAME_CONFIG.LEVELS[3];
        expect(lvl3).toBeDefined();
        expect(lvl3.mapId).toBe('map03');
        // Phải có ít nhất 1 wave dùng groups
        const hasGroups = lvl3.waves.some(w => Array.isArray(w.groups));
        expect(hasGroups).toBe(true);
    });

    // [Commit 16/19] Map 4 + Level 4 validation
    test('Map 04 "Ngã ba phòng tuyến" có đúng 2 path hội tụ tại cùng 1 base', () => {
        const map04 = GAME_CONFIG.MAPS.map04;
        expect(map04).toBeDefined();
        expect(map04.paths).toHaveLength(2);
        // Cả 2 path phải có ≥ 2 waypoint
        map04.paths.forEach(path => {
            expect(path.length).toBeGreaterThanOrEqual(2);
        });
        // Waypoint cuối của cả 2 path phải khớp với vị trí base (cùng x, y)
        const baseX = map04.base.x, baseY = map04.base.y;
        map04.paths.forEach(path => {
            const last = path[path.length - 1];
            expect(last.x).toBe(baseX);
            expect(last.y).toBe(baseY);
        });
    });

    test('Level 4 "Vây hãm" sử dụng map04 + có wave format parallel', () => {
        const lvl4 = GAME_CONFIG.LEVELS[4];
        expect(lvl4).toBeDefined();
        expect(lvl4.mapId).toBe('map04');
        expect(lvl4.waves.length).toBeGreaterThanOrEqual(4);

        // Wave cuối cùng phải dùng format parallel (đợt khó nhất)
        const lastWave = lvl4.waves[lvl4.waves.length - 1];
        expect(Array.isArray(lastWave.parallel)).toBe(true);
        expect(lastWave.parallel.length).toBe(2);

        // Parallel sub-spawners phải spawn trên 2 path khác nhau (0 và 1)
        const pathIndices = lastWave.parallel.map(s => s.pathIndex);
        expect(pathIndices).toContain(0);
        expect(pathIndices).toContain(1);
    });

    test('Level 4 wave 1 + wave 2 spawn trên 2 path khác nhau', () => {
        const waves = GAME_CONFIG.LEVELS[4].waves;
        expect(waves[0].pathIndex).toBe(0);   // Wave 1 → Path A
        expect(waves[1].pathIndex).toBe(1);   // Wave 2 → Path B
    });
});
