/* eslint-env node, jest */
/**
 * Unit tests — TowerAttack (UC10 — Tháp tấn công kẻ thù)
 *
 * Chiến lược test:
 * - Load config.js để có GAME_CONFIG.
 * - Load game.js và expose các object/class cần test:
 *   Enemy_Manager, Map_Grid, Tower, Projectile, Game_Manager, Enemy, Player_Stats.
 * - Test đúng phần đã cải tiến:
 *   + Lọc enemy hợp lệ trong tầm bắn.
 *   + Tower chọn enemy gần căn cứ nhất.
 *   + Nếu ngang mức nguy hiểm thì chọn enemy ít máu hơn.
 *   + Tower chỉ bắn khi cooldown sẵn sàng.
 *   + Projectile không gây sát thương sai khi target đã chết.
 *   + AOE không đánh enemy đã chết.
 *   + Enemy di chuyển và check va chạm base đúng theo pathIndex.
 *   + Game_Manager điều phối xóa Enemy chết và cộng vàng thưởng.
 *
 * Chạy:
 *   npx jest tests/tower_attack.test.js --verbose
 */

const { loadSource } = require('./helpers/load-source');

// ─────────────────────────────────────────────────────────────────────────────
// Mock môi trường browser trước khi load source
// ─────────────────────────────────────────────────────────────────────────────

global.window = {};
global.localStorage = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
};
global.requestAnimationFrame = jest.fn();
global.cancelAnimationFrame = jest.fn();

global.document = {
    getElementById: jest.fn(() => ({
        innerText: '',
        classList: {
            add: jest.fn(),
            remove: jest.fn(),
            toggle: jest.fn(),
            contains: jest.fn(() => false),
        },
        style: {},
        onclick: null,
        querySelector: jest.fn(() => ({ innerText: '' })),
        addEventListener: jest.fn(),
        getContext: jest.fn(() => ({
            clearRect: jest.fn(),
            fillRect: jest.fn(),
            beginPath: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            fillText: jest.fn(),
            setLineDash: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
        })),
    })),
    querySelectorAll: jest.fn(() => []),
    querySelector: jest.fn(() => null),
};

// Mock Wave_Manager vì game.js có tham chiếu trong Game_Manager
global.Wave_Manager = {
    getWaveTotalCount: jest.fn(() => 0),
    enemiesSpawnedThisWave: 0,
    startLevel: jest.fn(),
    reset: jest.fn(),
    update: jest.fn(),
};

// Load source thật
loadSource('src/core/config.js', ['GAME_CONFIG']);
loadSource('src/core/game.js', [
    'Player_Stats',
    'Enemy',
    'Enemy_Manager',
    'Map_Grid',
    'Tower',
    'Projectile',
    'Game_Manager',
    'UI_Manager'
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helper tạo enemy test
// ─────────────────────────────────────────────────────────────────────────────

function makeEnemy({
                       x = 0,
                       y = 0,
                       node = 0,
                       hp = 40,
                       pathIndex = 0,
                       speed = 1,
                       reward = 15,
                       damage = 1,
                       type = 'creep',
                   } = {}) {
    const enemy = new Enemy({
        x,
        y,
        node,
        hp,
        pathIndex,
        speed,
        reward,
        damage,
        type,
        size: 16,
        color: '#c0392b',
        icon: '👾',
    });

    enemy.takeDamage = jest.fn(function (dmg) {
        this.hp -= dmg;
        return this.hp;
    });

    return enemy;
}

function resetMapForTest() {
    Map_Grid.paths = [
        [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 200, y: 0 },
        ],
        [
            { x: 0, y: 100 },
            { x: 0, y: 200 },
            { x: 0, y: 300 },
        ],
    ];

    Map_Grid.base = { x: 200, y: 0, radius: 50 };
}

beforeEach(() => {
    jest.clearAllMocks();

    Game_Manager.enemies = [];
    Game_Manager.towers = [];
    Game_Manager.projectiles = [];
    Game_Manager.explosions = [];

    resetMapForTest();

    Player_Stats.money = 0;
    Player_Stats.hp = 20;
    Player_Stats.maxHp = 20;

    UI_Manager.updateUI = jest.fn();
});

// =============================================================================
// UC10 — TOWER ATTACK TEST SUITE
// =============================================================================

describe('UC10: Tower Attack — Tháp tấn công kẻ thù', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 1: Enemy_Manager lọc enemy hợp lệ
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 1 — Lọc mục tiêu hợp lệ', () => {

        test('BR-Tower-01: getEnemiesInRange chỉ trả về enemy còn sống, còn tồn tại và trong tầm', () => {
            const aliveInRange = makeEnemy({ x: 100, y: 100, hp: 40 });
            const deadInRange = makeEnemy({ x: 110, y: 100, hp: 0 });
            const aliveOutRange = makeEnemy({ x: 400, y: 100, hp: 40 });
            const removedEnemy = makeEnemy({ x: 105, y: 100, hp: 40 });

            Game_Manager.enemies = [
                aliveInRange,
                deadInRange,
                aliveOutRange,
            ];

            const result = Enemy_Manager.getEnemiesInRange(100, 100, 120);

            expect(result).toEqual([aliveInRange]);
            expect(Enemy_Manager.isTargetable(aliveInRange)).toBe(true);
            expect(Enemy_Manager.isTargetable(deadInRange)).toBe(false);
            expect(Enemy_Manager.isTargetable(removedEnemy)).toBe(false);
        });

        test('BR-Tower-02: getRemainingPathDistance tính đúng khoảng cách còn lại theo pathIndex', () => {
            const enemyPath1 = makeEnemy({
                x: 0,
                y: 150,
                node: 1,
                pathIndex: 1,
            });

            const distance = Enemy_Manager.getRemainingPathDistance(enemyPath1);

            // Path 1: enemy ở y=150, next waypoint y=200, còn 50
            // Sau đó từ y=200 tới y=300 còn 100
            // Tổng còn lại = 150
            expect(distance).toBeCloseTo(150);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 2: Tower chọn mục tiêu thông minh
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 2 — Tower chọn mục tiêu ưu tiên', () => {

        test('BR-Tower-03: Tower ưu tiên enemy gần căn cứ nhất', () => {
            const tower = new Tower(100, 0, 'archer');
            tower.range = 500;

            const enemyFarFromBase = makeEnemy({
                x: 10,
                y: 0,
                node: 1,
                hp: 40,
                pathIndex: 0,
            });

            const enemyNearBase = makeEnemy({
                x: 150,
                y: 0,
                node: 2,
                hp: 40,
                pathIndex: 0,
            });

            const target = tower.selectTarget([
                enemyFarFromBase,
                enemyNearBase,
            ]);

            expect(target).toBe(enemyNearBase);
        });

        test('BR-Tower-04: Nếu mức nguy hiểm bằng nhau thì Tower chọn enemy ít máu hơn', () => {
            const tower = new Tower(100, 0, 'archer');

            const highHpEnemy = makeEnemy({
                x: 120,
                y: 0,
                node: 1,
                hp: 40,
                pathIndex: 0,
            });

            const lowHpEnemy = makeEnemy({
                x: 120,
                y: 0,
                node: 1,
                hp: 10,
                pathIndex: 0,
            });

            const target = tower.selectTarget([
                highHpEnemy,
                lowHpEnemy,
            ]);

            expect(target).toBe(lowHpEnemy);
        });

        test('BR-Tower-05: Tower không bắn khi cooldown chưa sẵn sàng', () => {
            const tower = new Tower(100, 0, 'archer');
            const enemy = makeEnemy({
                x: 120,
                y: 0,
                node: 1,
                hp: 40,
            });

            Game_Manager.enemies = [enemy];
            tower.cooldownTimer = 100;

            tower.update(16.67);

            expect(Game_Manager.projectiles.length).toBe(0);
            expect(tower.cooldownTimer).toBeLessThan(100);
        });

        test('BR-Tower-06: Tower tạo Projectile khi cooldown sẵn sàng và có enemy trong tầm', () => {
            const tower = new Tower(100, 0, 'archer');
            tower.range = 200;
            tower.cooldownTimer = 0;

            const enemy = makeEnemy({
                x: 120,
                y: 0,
                node: 1,
                hp: 40,
            });

            Game_Manager.enemies = [enemy];

            tower.update(16.67);

            expect(Game_Manager.projectiles.length).toBe(1);
            expect(Game_Manager.projectiles[0].target).toBe(enemy);
            expect(tower.cooldownTimer).toBe(tower.cd);
        });

        test('BR-Tower-07: Tower không tạo Projectile khi không có enemy trong tầm', () => {
            const tower = new Tower(100, 0, 'archer');
            tower.range = 50;
            tower.cooldownTimer = 0;

            const enemy = makeEnemy({
                x: 500,
                y: 0,
                node: 1,
                hp: 40,
            });

            Game_Manager.enemies = [enemy];

            tower.update(16.67);

            expect(Game_Manager.projectiles.length).toBe(0);
            expect(tower.cooldownTimer).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 3: Projectile xử lý sát thương
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 3 — Projectile bay và gây sát thương', () => {

        test('BR-Tower-08: Projectile thường gây sát thương khi chạm enemy', () => {
            const target = makeEnemy({
                x: 100,
                y: 100,
                hp: 40,
            });

            Game_Manager.enemies = [target];

            const tower = new Tower(90, 100, 'archer');
            tower.dmg = 10;
            tower.attackType = 'single';

            const projectile = new Projectile(tower, target);
            const stillAlive = projectile.update();

            expect(target.takeDamage).toHaveBeenCalledWith(10);
            expect(target.hp).toBe(30);
            expect(stillAlive).toBe(false);
        });

        test('BR-Tower-09: Projectile không gây sát thương sai khi target đã chết giữa đường', () => {
            const target = makeEnemy({
                x: 200,
                y: 100,
                hp: 0,
            });

            Game_Manager.enemies = [target];

            const tower = new Tower(100, 100, 'archer');
            tower.dmg = 10;
            tower.attackType = 'single';

            const projectile = new Projectile(tower, target);
            const stillAlive = projectile.update();

            expect(target.takeDamage).not.toHaveBeenCalled();
            expect(stillAlive).toBe(true);
        });

        test('BR-Tower-10: Projectile không gây sát thương nếu target đã bị xóa khỏi Game_Manager.enemies', () => {
            const target = makeEnemy({
                x: 200,
                y: 100,
                hp: 40,
            });

            Game_Manager.enemies = [];

            const tower = new Tower(100, 100, 'archer');
            tower.dmg = 10;
            tower.attackType = 'single';

            const projectile = new Projectile(tower, target);
            projectile.update();

            expect(target.takeDamage).not.toHaveBeenCalled();
        });

        test('BR-Tower-11: Đạn AOE chỉ gây sát thương enemy còn sống trong vùng nổ', () => {
            const target = makeEnemy({
                x: 100,
                y: 100,
                hp: 40,
            });

            const aliveInExplosion = makeEnemy({
                x: 110,
                y: 100,
                hp: 40,
            });

            const deadInExplosion = makeEnemy({
                x: 115,
                y: 100,
                hp: 0,
            });

            const aliveOutExplosion = makeEnemy({
                x: 300,
                y: 100,
                hp: 40,
            });

            Game_Manager.enemies = [
                target,
                aliveInExplosion,
                deadInExplosion,
                aliveOutExplosion,
            ];

            const tower = new Tower(90, 100, 'cannon');
            tower.dmg = 25;
            tower.attackType = 'aoe';
            tower.explosionRadius = 50;

            const projectile = new Projectile(tower, target);
            const stillAlive = projectile.update();

            expect(stillAlive).toBe(false);
            expect(Game_Manager.explosions.length).toBe(1);

            expect(target.takeDamage).toHaveBeenCalledWith(25);
            expect(aliveInExplosion.takeDamage).toHaveBeenCalledWith(25);
            expect(deadInExplosion.takeDamage).not.toHaveBeenCalled();
            expect(aliveOutExplosion.takeDamage).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 4: Multi-path và kiểm tra va chạm căn cứ
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 4 — Hỗ trợ pathIndex cho map nhiều đường', () => {

        test('BR-Tower-12: updateEnemyPosition cho enemy đi đúng path theo pathIndex', () => {
            const enemy = makeEnemy({
                x: 0,
                y: 150,
                node: 1,
                pathIndex: 1,
                speed: 10,
            });

            Game_Manager.updateEnemyPosition(enemy);

            expect(enemy.x).toBeCloseTo(0);
            expect(enemy.y).toBeGreaterThan(150);
        });

        test('BR-Tower-13: checkBaseCollision trả về true khi enemy đi hết path của chính nó', () => {
            Map_Grid.paths = [
                [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 200, y: 0 },
                ],
                [
                    { x: 0, y: 100 },
                    { x: 0, y: 200 },
                ],
            ];

            Map_Grid.base = { x: 999, y: 999, radius: 50 };

            const enemy = makeEnemy({
                x: 0,
                y: 200,
                node: 2,
                pathIndex: 1,
            });

            const result = Game_Manager.checkBaseCollision(enemy);

            expect(result).toBe(true);
        });

        test('BR-Tower-14: checkBaseCollision trả về false khi enemy chưa hết path và chưa chạm base', () => {
            Map_Grid.base = { x: 200, y: 0, radius: 50 };

            const enemy = makeEnemy({
                x: 30,
                y: 0,
                node: 1,
                pathIndex: 0,
            });

            const result = Game_Manager.checkBaseCollision(enemy);

            expect(result).toBe(false);
        });
    });
    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 5: Tháp phép thuật
    // Kiểm tra tháp magic gây sát thương và thêm hiệu ứng làm chậm enemy
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 5 — Tháp phép thuật', () => {

        test('BR-Tower-15: Tháp phép thuật gây sát thương và làm chậm enemy', () => {
            const target = makeEnemy({
                x: 100,
                y: 100,
                hp: 40,
                speed: 2,
            });

            Game_Manager.enemies = [target];

            const tower = new Tower(90, 100, 'magic');
            tower.dmg = 8;
            tower.attackType = 'magic';
            tower.slowFactor = 0.65;
            tower.slowDuration = 1200;

            const projectile = new Projectile(tower, target);
            const stillAlive = projectile.update();

            expect(stillAlive).toBe(false);
            expect(target.takeDamage).toHaveBeenCalledWith(8);
            expect(target.effects).toEqual([
                {
                    type: 'slow',
                    factor: 0.65,
                    duration: 1200
                }
            ]);
        });

    });
    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 6: Tháp Độc
    // Kiểm tra Projectile loại poison gây sát thương ban đầu
    // và gắn hiệu ứng rút máu theo thời gian cho enemy.
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 6 — Tháp Độc', () => {

        test('BR-Tower-16: Tháp Độc gây sát thương ban đầu và gắn hiệu ứng poison cho enemy', () => {
            const target = makeEnemy({
                x: 100,
                y: 100,
                hp: 40,
                speed: 2,
            });

            Game_Manager.enemies = [target];

            const tower = new Tower(90, 100, 'archer');

            // [UC10 - Cải tiến] Giả lập tower mới là Tháp Độc.
            // Không dùng new Tower(..., 'poison') trực tiếp để tránh lỗi
            // nếu poison chỉ được inject vào GAME_CONFIG sau khi mở khóa.
            tower.dmg = 7;
            tower.attackType = 'poison';
            tower.poisonDmg = 2;
            tower.poisonDuration = 1800;

            const projectile = new Projectile(tower, target);
            const stillAlive = projectile.update();

            expect(stillAlive).toBe(false);

            // Enemy nhận sát thương ban đầu khi đạn độc chạm mục tiêu.
            expect(target.takeDamage).toHaveBeenCalledWith(7);
            expect(target.hp).toBe(33);

            // Enemy được gắn hiệu ứng poison để tiếp tục mất máu theo thời gian.
            expect(target.effects).toEqual([
                {
                    type: 'poison',
                    damage: 2,
                    duration: 1800,
                    tickInterval: 500,
                    tickTimer: 500
                }
            ]);
        });

        test('BR-Tower-17: Hiệu ứng poison rút máu enemy theo thời gian', () => {
            const target = makeEnemy({
                x: 100,
                y: 100,
                hp: 40,
                speed: 2,
            });

            Game_Manager.enemies = [target];

            // [UC10 - Cải tiến] Gắn sẵn hiệu ứng poison vào enemy
            // để kiểm tra Enemy.updateEffects(dt) xử lý rút máu đúng.
            target.effects.push({
                type: 'poison',
                damage: 3,
                duration: 1000,
                tickInterval: 500,
                tickTimer: 0
            });

            target.updateEffects(100);

            // Vì tickTimer <= 0 nên enemy bị trừ máu 1 lần.
            expect(target.takeDamage).toHaveBeenCalledWith(3);
            expect(target.hp).toBe(37);

            // Sau khi tick, timer được reset lại để chờ lần rút máu tiếp theo.
            expect(target.effects[0].tickTimer).toBe(500);

            target.updateEffects(900);

            // Hết duration thì hiệu ứng poison bị xóa khỏi enemy.
            expect(target.effects.length).toBe(0);
        });

    });
    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 7: Enemy bị tiêu diệt
    // Kiểm tra sau khi refactor:
    // - Enemy.onDeath() chỉ trả thông tin reward.
    // - Enemy_Manager.removeEnemy() chịu trách nhiệm xóa Enemy.
    // - Game_Manager.checkEnemyDeath() điều phối xóa Enemy và cộng vàng.
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 7 — Enemy bị tiêu diệt', () => {

        test('BR-Tower-18: Enemy.onDeath chỉ trả reward, không tự xóa Enemy và không tự cộng vàng', () => {
            const enemy = makeEnemy({
                x: 100,
                y: 100,
                hp: 0,
                reward: 30
            });

            Game_Manager.enemies = [enemy];
            Player_Stats.money = 50;

            const deathInfo = enemy.onDeath();

            expect(deathInfo).toEqual({ reward: 30 });
            expect(Game_Manager.enemies).toEqual([enemy]);
            expect(Player_Stats.money).toBe(50);
        });

        test('BR-Tower-19: Enemy_Manager.removeEnemy xóa đúng Enemy khỏi danh sách quản lý', () => {
            const enemyA = makeEnemy({
                x: 100,
                y: 100,
                hp: 20,
                reward: 10
            });

            const enemyB = makeEnemy({
                x: 120,
                y: 100,
                hp: 20,
                reward: 15
            });

            Game_Manager.enemies = [enemyA, enemyB];

            Enemy_Manager.removeEnemy(enemyA);

            expect(Game_Manager.enemies).toEqual([enemyB]);
        });

        test('BR-Tower-20: Game_Manager.handleEnemyKilled xóa Enemy và cộng vàng thưởng', () => {
            const deadEnemy = makeEnemy({
                x: 100,
                y: 100,
                hp: 0,
                reward: 25
            });

            const aliveEnemy = makeEnemy({
                x: 120,
                y: 100,
                hp: 40,
                reward: 10
            });

            Game_Manager.enemies = [deadEnemy, aliveEnemy];
            Player_Stats.money = 100;

            Game_Manager.handleEnemyKilled(deadEnemy);

            expect(Game_Manager.enemies).toEqual([aliveEnemy]);
            expect(Game_Manager.enemies).not.toContain(deadEnemy);
            expect(Player_Stats.money).toBe(125);
        });

        test('BR-Tower-21: checkEnemyDeath chỉ xử lý Enemy hết máu và giữ lại Enemy còn sống', () => {
            const deadEnemy = makeEnemy({
                x: 100,
                y: 100,
                hp: 0,
                reward: 25
            });

            const aliveEnemy = makeEnemy({
                x: 120,
                y: 100,
                hp: 40,
                reward: 10
            });

            Game_Manager.enemies = [deadEnemy, aliveEnemy];
            Player_Stats.money = 100;

            Game_Manager.checkEnemyDeath();

            expect(Game_Manager.enemies).toEqual([aliveEnemy]);
            expect(Game_Manager.enemies).toContain(aliveEnemy);
            expect(Game_Manager.enemies).not.toContain(deadEnemy);
            expect(Player_Stats.money).toBe(125);
            expect(UI_Manager.updateUI).toHaveBeenCalled();
        });

    });
});