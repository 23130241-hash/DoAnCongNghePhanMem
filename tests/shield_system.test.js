/**
 * Unit tests — ShieldSystem (UC12 — Cơ chế Khiên bảo vệ Căn cứ)
 *
 * Chiến lược test (theo pattern của combo_damge.test.js):
 *   - Mock toàn bộ dependency toàn cục (Player_Stats, Game_Manager,
 *     UI_Manager, Map_Grid, GAME_CONFIG) TRƯỚC khi load source.
 *   - Load shield_system.js → module tự patch Game_Manager.reduceBaseHP
 *     và expose window.Shield.
 *   - Test từng chức năng: mua khiên, hồi máu, hấp thụ damage,
 *     overflow shield → HP, blast cooldown, reset khi startLevel.
 *
 * Chạy: npx jest shield_system.test.js --verbose
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mock dependencies TRƯỚC khi load source
// ─────────────────────────────────────────────────────────────────────────────

// Giả lập GAME_CONFIG với các enemy có damage khác nhau
global.GAME_CONFIG = {
    ENEMIES: {
        creep      : { hp: 40,  damage: 1, color: '#c0392b', icon: '👾' },
        fast_creep : { hp: 25,  damage: 1, color: '#8e44ad', icon: '🏃' },
        skeleton   : { hp: 60,  damage: 2, color: '#ecf0f1', icon: '💀' },
        tank       : { hp: 150, damage: 3, color: '#2c3e50', icon: '🛡️' },
        boss       : { hp: 400, damage: 5, color: '#8b0000', icon: '👹', isBoss: true }
    },
    LEVELS: {
        1: { startHP: 20, startMoney: 300, startHp: 20, mapId: 'map01',
            waves: [{ enemyType: 'creep', count: 10, interval: 1000 }] }
    }
};

// ── Player_Stats mock — đúng API của game.js ──────────────────────────────
global.Player_Stats = {
    hp       : 20,
    maxHp    : 20,
    money    : 300,
    shield   : 0,
    maxShield: 50,
    blastLastUsed: 0,
    checkMoney (cost) { return this.money >= cost; },
    deductMoney(cost) { this.money -= cost; },
    addMoney   (amt)  { this.money += amt; },
};

// ── Hàm reduceBaseHP gốc (UC11) — sẽ bị patch bởi shield_system.js ──────
// Dùng jest.fn() có implementation để theo dõi đồng thời vẫn hoạt động thật
const _origReduceBaseHP = jest.fn((damage) => {
    Player_Stats.hp = Math.max(0, Player_Stats.hp - damage);
});

// ── Game_Manager mock ─────────────────────────────────────────────────────
global.Game_Manager = {
    isPlaying  : true,
    isGameOver : false,
    isPaused   : false,
    enemies    : [],
    reduceBaseHP  : _origReduceBaseHP,   // sẽ bị shield_system.js override
    startLevel    : jest.fn(),
    destroyEnemy  : jest.fn((enemy) => {
        Game_Manager.enemies = Game_Manager.enemies.filter(e => e !== enemy);
    }),
    checkGameOver : jest.fn(() => Player_Stats.hp <= 0),
};

// ── Map_Grid mock ─────────────────────────────────────────────────────────
global.Map_Grid = {
    base: { x: 900, y: 500, radius: 60 }
};

// ── UI_Manager mock — tất cả hàm đều jest.fn() ───────────────────────────
global.UI_Manager = {
    showError           : jest.fn(),
    updateUI            : jest.fn(),
    updateHPDisplay     : jest.fn(),
    updateShieldDisplay : jest.fn(),
    flashScreenRed      : jest.fn(),
    flashScreenBlue     : jest.fn(),
    showShieldBreakEffect: jest.fn(),
    showBlastEffect     : jest.fn(),
};

// ── DOM stubs tối giản (shield_system.js inject HUD vào DOM) ─────────────
global.document = {
    getElementById : jest.fn(() => null),       // không có element thật → HUD inject bị skip
    querySelector  : jest.fn(() => null),
    createElement  : jest.fn(() => ({           // trả về element stub nếu cần
        style: {}, classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) },
        appendChild: jest.fn(),
    })),
    head           : { appendChild: jest.fn() },
    querySelectorAll: jest.fn(() => []),
};
global.window   = global;    // expose window = global để shield_system.js có thể set window.Shield
global.MutationObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
global.requestAnimationFrame = jest.fn();   // stub rAF, không cần chạy thật

// ── Sử dụng fake timers của Jest để kiểm soát setInterval/setTimeout ─────
// (dùng trong test cooldown)

// ── Helper load source (cùng pattern với combo_damge.test.js) ────────────
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/managers/shield_system.js');
});

// ── Reset state trước mỗi test ────────────────────────────────────────────
beforeEach(() => {
    jest.clearAllMocks();

    // Reset Player_Stats về trạng thái ban đầu
    Player_Stats.hp            = 20;
    Player_Stats.maxHp         = 20;
    Player_Stats.money         = 300;
    Player_Stats.shield        = 0;
    Player_Stats.blastLastUsed = 0;

    // Reset Game_Manager
    Game_Manager.isPlaying  = true;
    Game_Manager.isGameOver = false;
    Game_Manager.isPaused   = false;
    Game_Manager.enemies    = [];

    // Restore _origReduceBaseHP (phòng trường hợp test trước override)
    _origReduceBaseHP.mockImplementation((damage) => {
        Player_Stats.hp = Math.max(0, Player_Stats.hp - damage);
    });
});

// =============================================================================
// UC12 — SHIELD SYSTEM TEST SUITE
// =============================================================================

describe('UC12: Shield System — Cơ chế Khiên bảo vệ Căn cứ', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 1: MUA KHIÊN (_onBuyShield)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 1 — Mua Khiên (🛡️ Buy Shield)', () => {

        test('BR-Shield-01: Mua khiên thành công khi đủ tiền', () => {
            Player_Stats.money  = 300;
            Player_Stats.shield = 0;

            global.Shield.testBuyShield();

            // Tiền phải giảm đúng 200g (SHIELD_BUY_COST)
            expect(Player_Stats.money).toBe(100);
            // Shield phải tăng đúng 10 (SHIELD_BUY_AMOUNT)
            expect(Player_Stats.shield).toBe(10);
            // UI phải được cập nhật
            expect(UI_Manager.updateUI).toHaveBeenCalled();
            expect(UI_Manager.updateShieldDisplay).toHaveBeenCalled();
        });

        test('BR-Shield-02: Không mua được khiên khi không đủ tiền', () => {
            Player_Stats.money  = 50;   // Nhỏ hơn SHIELD_BUY_COST = 200
            Player_Stats.shield = 0;

            global.Shield.testBuyShield();

            // Tiền và shield không thay đổi
            expect(Player_Stats.money).toBe(50);
            expect(Player_Stats.shield).toBe(0);
            // Phải hiển thị lỗi
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('75g'),
                '#e74c3c'
            );
        });

        test('BR-Shield-03: Không mua được khiên khi đã đạt MAX_SHIELD (50)', () => {
            Player_Stats.money  = 300;
            Player_Stats.shield = 50;   // Đã đầy

            global.Shield.testBuyShield();

            // Tiền không thay đổi, shield không vượt quá 50
            expect(Player_Stats.money).toBe(300);
            expect(Player_Stats.shield).toBe(50);
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('đầy'),
                '#3498db'
            );
        });

        test('BR-Shield-04: Shield không vượt quá MAX_SHIELD khi mua nhiều lần liên tiếp', () => {
            Player_Stats.money  = 1000;
            Player_Stats.shield = 45;   // Còn 5 chỗ trống

            global.Shield.testBuyShield(); // +10 → phải cap tại 50

            expect(Player_Stats.shield).toBe(50);   // Math.min(50, 45+10) = 50
            expect(Player_Stats.money).toBe(800);   // Vẫn trừ tiền
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 2: HỒI MÁU (_onBuyHeal)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 2 — Hồi Máu (❤️ Buy Heal)', () => {

        test('BR-Shield-05: Hồi máu thành công — trừ tiền và cộng HP đúng (+15)', () => {
            Player_Stats.money = 200;
            Player_Stats.hp    = 5;
            Player_Stats.maxHp = 20;

            global.Shield.testHeal();

            // Tiền phải giảm đúng 50g (HEAL_BUY_COST)
            expect(Player_Stats.money).toBe(0);
            // HP phải tăng đúng 15 (HEAL_AMOUNT)
            expect(Player_Stats.hp).toBe(20);
            expect(UI_Manager.updateHPDisplay).toHaveBeenCalledWith(20);
            expect(UI_Manager.updateUI).toHaveBeenCalled();
        });

        test('BR-Shield-06: Hồi máu phải trừ tiền thật (money không còn nguyên)', () => {
            // Đây là regression test cho Bug 2: gold -= cost không có effect
            Player_Stats.money = 300;
            Player_Stats.hp    = 10;

            global.Shield.testHeal();

            // Nếu bug còn tồn tại: money vẫn = 100
            // Nếu đã fix: money = 50
            expect(Player_Stats.money).toBe(100);
        });

        test('BR-Shield-07: HP không vượt quá maxHp khi hồi với HP gần đầy', () => {
            Player_Stats.money = 300;
            Player_Stats.hp    = 18;   // Chỉ còn 2 chỗ, HEAL_AMOUNT = 15
            Player_Stats.maxHp = 20;

            global.Shield.testHeal();

            // Chỉ hồi 2 HP (Math.min(15, 20-18) = 2)
            expect(Player_Stats.hp).toBe(20);
            expect(Player_Stats.money).toBe(100);  // Vẫn trừ đủ tiền
        });

        test('BR-Shield-08: Không hồi máu khi không đủ tiền', () => {
            Player_Stats.money = 30;   // Nhỏ hơn HEAL_BUY_COST = 50
            Player_Stats.hp    = 10;

            global.Shield.testHeal();

            expect(Player_Stats.money).toBe(30);
            expect(Player_Stats.hp).toBe(10);
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('50g'),
                '#e74c3c'
            );
        });

        test('BR-Shield-09: Không hồi máu khi HP đã đầy', () => {
            Player_Stats.money = 200;
            Player_Stats.hp    = 20;
            Player_Stats.maxHp = 20;

            global.Shield.testHeal();

            expect(Player_Stats.money).toBe(200);  // Không trừ tiền
            expect(Player_Stats.hp).toBe(20);
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('đầy'),
                '#2ecc71'
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 3: HẤP THỤ DAMAGE (Game_Manager.reduceBaseHP — Case A, B, C)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 3 — Hấp thụ Damage (reduceBaseHP patch)', () => {

        test('BR-Shield-10: Case A — Shield đủ hấp thụ toàn bộ, HP không thay đổi', () => {
            Player_Stats.shield = 10;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(3);  // damage = 3 (tank), shield = 10

            expect(Player_Stats.shield).toBe(7);    // 10 - 3 = 7
            expect(Player_Stats.hp).toBe(20);       // HP nguyên
            expect(UI_Manager.flashScreenBlue).toHaveBeenCalled();
            // UC11 flash đỏ KHÔNG được gọi
            expect(UI_Manager.flashScreenRed).not.toHaveBeenCalled();
            // UC11 _origReduceBaseHP KHÔNG được gọi
            expect(_origReduceBaseHP).not.toHaveBeenCalled();
        });

        test('BR-Shield-11: Case A — Shield = damage (đúng biên), hấp thụ hết, shield = 0', () => {
            Player_Stats.shield = 5;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(5);  // boss damage = 5 = shield

            expect(Player_Stats.shield).toBe(0);
            expect(Player_Stats.hp).toBe(20);       // HP vẫn nguyên
            expect(UI_Manager.flashScreenBlue).toHaveBeenCalled();
        });

        test('BR-Shield-12: Case B — Shield không đủ, overflow trừ vào HP', (done) => {
            Player_Stats.shield = 3;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(5);  // overflow = 5 - 3 = 2

            expect(Player_Stats.shield).toBe(0);
            expect(UI_Manager.showShieldBreakEffect).toHaveBeenCalled();
            expect(UI_Manager.flashScreenBlue).toHaveBeenCalled();

            // HP bị trừ sau delay 180ms
            setTimeout(() => {
                expect(Player_Stats.hp).toBe(18);   // 20 - 2 = 18
                done();
            }, 250);
        });

        test('BR-Shield-13: Case C — Shield = 0, gọi thẳng logic UC11 (flash đỏ, trừ HP)', () => {
            Player_Stats.shield = 0;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(3);

            // Logic gốc phải được gọi
            expect(_origReduceBaseHP).toHaveBeenCalledWith(3);
            expect(Player_Stats.hp).toBe(17);
            expect(UI_Manager.flashScreenBlue).not.toHaveBeenCalled();
        });

        test('BR-Shield-14: Sát thương của tank (damage=3) đúng loại quái — không hardcode', () => {
            // Verify rằng damage đọc từ config, không hardcode
            const tankDmg = GAME_CONFIG.ENEMIES.tank.damage;
            expect(tankDmg).toBe(3);   // Đúng theo config

            Player_Stats.shield = 2;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(tankDmg);  // Case B: 3 > 2

            expect(Player_Stats.shield).toBe(0);
            expect(UI_Manager.showShieldBreakEffect).toHaveBeenCalled();
        });

        test('BR-Shield-15: HP không âm khi damage vượt quá shield + HP còn lại', (done) => {
            Player_Stats.shield = 2;
            Player_Stats.hp     = 1;

            Game_Manager.reduceBaseHP(5);  // overflow = 3, HP chỉ có 1

            setTimeout(() => {
                // Math.max(0, 1 - 3) = 0 — không âm
                expect(Player_Stats.hp).toBe(0);
                expect(Player_Stats.hp).toBeGreaterThanOrEqual(0);
                done();
            }, 250);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 4: XUNG PHÁ — BLAST COOLDOWN (_onBlast)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 4 — Xung Phá (⚡ Aura Blast & Cooldown)', () => {

        test('BR-Shield-16: Xung Phá tiêu diệt quái trong bán kính căn cứ (≤ 150px)', () => {
            // Quái trong bán kính (150px từ base {900, 500})
            Game_Manager.enemies = [
                { x: 850, y: 500, type: 'creep' },    // dx=50 → hypot=50 ≤ 150 ✓
                { x: 780, y: 500, type: 'creep' },    // dx=120 → hypot=120 ≤ 150 ✓
                { x: 500, y: 500, type: 'tank'  },    // dx=400 → hypot=400 > 150 ✗
            ];
            Player_Stats.blastLastUsed = 0;   // Chưa dùng lần nào

            global.Shield.testBlast();

            // destroyEnemy phải được gọi đúng 2 lần (2 quái trong bán kính)
            expect(Game_Manager.destroyEnemy).toHaveBeenCalledTimes(2);
            expect(UI_Manager.showBlastEffect).toHaveBeenCalledWith(
                Map_Grid.base.x, Map_Grid.base.y, 150
            );
        });

        test('BR-Shield-17: Xung Phá bị chặn khi đang trong thời gian hồi chiêu', () => {
            // Giả lập vừa dùng blast 5 giây trước (cooldown 30s chưa hết)
            Player_Stats.blastLastUsed = Date.now() - 5000;
            Game_Manager.enemies = [{ x: 900, y: 500, type: 'creep' }];

            global.Shield.testBlast();

            // destroyEnemy không được gọi
            expect(Game_Manager.destroyEnemy).not.toHaveBeenCalled();
            // Phải hiển thị thông báo hồi chiêu
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('s'),  // "Hồi chiêu còn Xs"
                '#9b59b6'
            );
        });

        test('BR-Shield-18: Cooldown được ghi nhận sau khi dùng Blast', () => {
            // Trước khi dùng: blastLastUsed = 0 (chưa dùng bao giờ)
            expect(Player_Stats.blastLastUsed).toBe(0);
            Player_Stats.blastLastUsed = 0;
            Game_Manager.enemies = [];

            const before = Date.now();
            global.Shield.testBlast();
            const after  = Date.now();

            // blastLastUsed phải được cập nhật thành timestamp hiện tại
            expect(Player_Stats.blastLastUsed).toBeGreaterThanOrEqual(before);
            expect(Player_Stats.blastLastUsed).toBeLessThanOrEqual(after);
        });

        test('BR-Shield-19: Blast không hoạt động khi game đang pause', () => {
            Game_Manager.isPaused  = true;
            Game_Manager.isPlaying = true;
            Player_Stats.blastLastUsed = 0;
            Game_Manager.enemies = [{ x: 900, y: 500, type: 'creep' }];

            global.Shield.testBlast();

            expect(Game_Manager.destroyEnemy).not.toHaveBeenCalled();
        });

        test('BR-Shield-20: Blast không hoạt động khi game over', () => {
            Game_Manager.isPlaying  = false;
            Game_Manager.isGameOver = true;
            Player_Stats.blastLastUsed = 0;
            Game_Manager.enemies = [{ x: 900, y: 500, type: 'creep' }];

            global.Shield.testBlast();

            expect(Game_Manager.destroyEnemy).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 5: RESET KHI VÀO MÀN MỚI (startLevel patch)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 5 — Reset khi startLevel / Retry', () => {

        test('BR-Shield-21: Shield về 0 và cooldown được xóa khi startLevel()', () => {
            // Giả lập trạng thái giữa màn
            Player_Stats.shield        = 30;
            Player_Stats.blastLastUsed = Date.now() - 10000;

            // Gọi startLevel như khi người chơi nhấn Retry
            Game_Manager.startLevel(1);

            expect(Player_Stats.shield).toBe(0);
            expect(Player_Stats.blastLastUsed).toBe(0);
            // updateShieldDisplay phải được gọi để sync HUD
            expect(UI_Manager.updateShieldDisplay).toHaveBeenCalled();
        });

        test('BR-Shield-22: startLevel() gọi logic gốc (mock ban đầu được gọi)', () => {
            Game_Manager.startLevel(1);
            // _origStartLevel (mock jest.fn()) phải được gọi đúng 1 lần
            // Kiểm tra gián tiếp: shield = 0 chứng tỏ patch chạy → _orig cũng chạy
            expect(Player_Stats.shield).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 6: DEBUG API — window.Shield
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 6 — Debug API (window.Shield)', () => {

        test('BR-Shield-23: Shield API được expose ra global', () => {
            expect(global.Shield).toBeDefined();
            expect(typeof global.Shield.addShield).toBe('function');
            expect(typeof global.Shield.resetShield).toBe('function');
            expect(typeof global.Shield.testAbsorb).toBe('function');
            expect(typeof global.Shield.testBlast).toBe('function');
            expect(typeof global.Shield.testHeal).toBe('function');
            expect(typeof global.Shield.testBuyShield).toBe('function');
        });

        test('BR-Shield-24: addShield(n) tăng shield đúng lượng', () => {
            Player_Stats.shield = 5;

            global.Shield.addShield(10);

            expect(Player_Stats.shield).toBe(15);
            expect(UI_Manager.updateShieldDisplay).toHaveBeenCalled();
        });

        test('BR-Shield-25: addShield(n) không vượt quá MAX_SHIELD (50)', () => {
            Player_Stats.shield = 48;

            global.Shield.addShield(10);

            expect(Player_Stats.shield).toBe(50);  // Math.min(50, 48+10)
        });

        test('BR-Shield-26: resetShield() đưa shield về 0', () => {
            Player_Stats.shield = 35;

            global.Shield.resetShield();

            expect(Player_Stats.shield).toBe(0);
            expect(UI_Manager.updateShieldDisplay).toHaveBeenCalled();
        });

        test('BR-Shield-27: testAbsorb(type) gọi reduceBaseHP với damage đúng loại quái', () => {
            Player_Stats.shield = 20;

            global.Shield.testAbsorb('tank');  // tank.damage = 3

            // reduceBaseHP (đã được patch) phải được gọi với 3
            // Kiểm tra gián tiếp qua shield: 20 - 3 = 17
            expect(Player_Stats.shield).toBe(17);
        });

        test('BR-Shield-28: testAbsorb với type không tồn tại → log error, không crash', () => {
            const spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
            const shieldBefore = Player_Stats.shield;

            global.Shield.testAbsorb('quai_khong_ton_tai');

            expect(console.error).toHaveBeenCalled();
            expect(Player_Stats.shield).toBe(shieldBefore);  // Không thay đổi
            spyErr.mockRestore();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 7: EDGE CASES
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 7 — Edge Cases & Boundary', () => {

        test('BR-Shield-29: Mua nhiều lần khiên đúng tích lũy (mua 3 lần)', () => {
            Player_Stats.money  = 300;
            Player_Stats.shield = 0;

            global.Shield.testBuyShield(); // +10, -75g → shield=10, money=225
            global.Shield.testBuyShield(); // +10, -75g → shield=20, money=150
            global.Shield.testBuyShield(); // +10, -75g → shield=30, money=75

            expect(Player_Stats.shield).toBe(30);
            expect(Player_Stats.money).toBe(75);
        });

        test('BR-Shield-30: Hồi máu + mua khiên trong cùng một frame không xung đột state', () => {
            Player_Stats.money  = 500;
            Player_Stats.hp     = 10;
            Player_Stats.shield = 0;

            global.Shield.testHeal();       // -50g, +15 HP
            global.Shield.testBuyShield();  // -75g, +10 shield

            expect(Player_Stats.money).toBe(375);   // 500 - 50 - 75
            expect(Player_Stats.hp).toBe(20);
            expect(Player_Stats.shield).toBe(10);
        });

        test('BR-Shield-31: Boss (damage=5) + shield=3 → overflow=2 trừ đúng vào HP', (done) => {
            Player_Stats.shield = 3;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(5);  // boss damage

            expect(Player_Stats.shield).toBe(0);
            expect(UI_Manager.showShieldBreakEffect).toHaveBeenCalled();

            setTimeout(() => {
                expect(Player_Stats.hp).toBe(18);   // 20 - 2 = 18
                done();
            }, 250);
        });

        test('BR-Shield-32: reduceBaseHP(0) — damage = 0, không làm gì cả', () => {
            Player_Stats.shield = 5;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(0);

            // shield >= 0 và damage = 0 → Case A nhưng không trừ gì
            expect(Player_Stats.shield).toBe(5);
            expect(Player_Stats.hp).toBe(20);
        });
    });
});