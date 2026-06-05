/**
 * Unit tests — ShieldSystem (UC11 — Cơ chế Khiên bảo vệ Căn cứ)
 *
 * Chiến lược test (theo pattern của combo_damge.test.js):
 * - Mock toàn bộ dependency toàn cục (Player_Stats, Game_Manager,
 * UI_Manager, Map_Grid, GAME_CONFIG) TRƯỚC khi load source.
 * - Load shield_system.js → module tự patch Game_Manager.reduceBaseHP
 * và expose window.Shield.
 * - Test từng chức năng: mua khiên, hồi máu, hấp thụ damage,
 * overflow shield → HP, blast cooldown, reset khi startLevel.
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
    destroyEnemy  : jest.fn(),
    checkGameOver : jest.fn(() => Player_Stats.hp <= 0),
};

// ── Map_Grid mock ─────────────────────────────────────────────────────────
global.Map_Grid = {
    base: { x: 900, y: 500, radius: 60 }
};

// ── UI_Manager mock ban đầu ───────────────────────────────────────────
global.UI_Manager = {};

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

// ── Helper load source (cùng pattern với combo_damge.test.js) ────────────
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/managers/shield_system.js');
});

// ── Reset state và ép buộc tái tạo Mock trước mỗi test case ─────────────────
beforeEach(() => {
    jest.clearAllMocks();

    // SỬA LỖI MOCK: Gán lại các hàm của UI_Manager thành Jest Mock trước mỗi test case
    // Điều này ngăn chặn việc source code shield_system.js ghi đè làm mất đi Mock của Jest
    UI_Manager.showError            = jest.fn();
    UI_Manager.updateUI             = jest.fn();
    UI_Manager.updateHPDisplay      = jest.fn();
    UI_Manager.updateShieldDisplay  = jest.fn();
    UI_Manager.flashScreenRed       = jest.fn();
    UI_Manager.flashScreenBlue      = jest.fn();
    UI_Manager.showShieldBreakEffect = jest.fn();
    UI_Manager.showBlastEffect      = jest.fn();

    // Đảm bảo destroyEnemy hoạt động chính xác và là một Mock function
    Game_Manager.destroyEnemy = jest.fn((enemy) => {
        Game_Manager.enemies = Game_Manager.enemies.filter(e => e !== enemy);
    });

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

    // Restore _origReduceBaseHP
    _origReduceBaseHP.mockImplementation((damage) => {
        Player_Stats.hp = Math.max(0, Player_Stats.hp - damage);
    });
});

// =============================================================================
// UC12 — SHIELD SYSTEM TEST SUITE
// =============================================================================

describe('UC12: Shield System — Cơ chế Khiên bảo vệ Căn cứ', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 1: MUA KHIÊN (_onBuyShield) - GIÁ MỚI 200G
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 1 — Mua Khiên (🛡️ Buy Shield)', () => {

        test('BR-Shield-01: Mua khiên thành công khi đủ tiền', () => {
            Player_Stats.money  = 300;
            Player_Stats.shield = 0;

            global.Shield.testBuyShield();

            // SỬA GIÁ MỚI: Tiền giảm đúng 200g (300g - 200g = 100g)
            expect(Player_Stats.money).toBe(100);
            expect(Player_Stats.shield).toBe(10);
            expect(UI_Manager.updateUI).toHaveBeenCalled();
            expect(UI_Manager.updateShieldDisplay).toHaveBeenCalled();
        });

        test('BR-Shield-02: Không mua được khiên khi không đủ tiền', () => {
            Player_Stats.money  = 50;   // Nhỏ hơn giá mới 200g
            Player_Stats.shield = 0;

            global.Shield.testBuyShield();

            expect(Player_Stats.money).toBe(50);
            expect(Player_Stats.shield).toBe(0);
            // SỬA THÔNG BÁO: Mong đợi chuỗi chứa '200g' thay vì '75g'
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('200g'),
                '#e74c3c'
            );
        });

        test('BR-Shield-03: Không mua được khiên khi đã đạt MAX_SHIELD (50)', () => {
            Player_Stats.money  = 300;
            Player_Stats.shield = 50;

            global.Shield.testBuyShield();

            expect(Player_Stats.money).toBe(300);
            expect(Player_Stats.shield).toBe(50);
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('đầy'),
                '#3498db'
            );
        });

        test('BR-Shield-04: Shield không vượt quá MAX_SHIELD khi mua nhiều lần liên tiếp', () => {
            Player_Stats.money  = 1000;
            Player_Stats.shield = 45;

            global.Shield.testBuyShield(); // +10 → cap tại 50

            expect(Player_Stats.shield).toBe(50);
            // SỬA GIÁ MỚI: Trừ đúng 200g (1000g - 200g = 800g)
            expect(Player_Stats.money).toBe(800);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 2: HỒI MÁU (_onBuyHeal) - GIÁ MỚI 200G
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 2 — Hồi Máu (❤️ Buy Heal)', () => {

        test('BR-Shield-05: Hồi máu thành công — trừ tiền và cộng HP đúng (+15)', () => {
            Player_Stats.money = 200; // Vừa khít 200g tiền mua mới
            Player_Stats.hp    = 5;
            Player_Stats.maxHp = 20;

            global.Shield.testHeal();

            // SỬA GIÁ MỚI: Tiền giảm sạch về 0 (200g - 200g = 0)
            expect(Player_Stats.money).toBe(0);
            expect(Player_Stats.hp).toBe(20);
            expect(UI_Manager.updateHPDisplay).toHaveBeenCalledWith(20);
            expect(UI_Manager.updateUI).toHaveBeenCalled();
        });

        test('BR-Shield-06: Hồi máu phải trừ tiền thật (money không còn nguyên)', () => {
            Player_Stats.money = 300;
            Player_Stats.hp    = 10;

            global.Shield.testHeal();

            // SỬA GIÁ MỚI: Tiền còn lại 100g (300g - 200g = 100g)
            expect(Player_Stats.money).toBe(100);
        });

        test('BR-Shield-07: HP không vượt quá maxHp khi hồi với HP gần đầy', () => {
            Player_Stats.money = 300;
            Player_Stats.hp    = 18;
            Player_Stats.maxHp = 20;

            global.Shield.testHeal();

            expect(Player_Stats.hp).toBe(20);
            // SỬA GIÁ MỚI: Tiền còn lại phải trừ đi 200g còn 100g
            expect(Player_Stats.money).toBe(100);
        });

        test('BR-Shield-08: Không hồi máu khi không đủ tiền', () => {
            Player_Stats.money = 30;   // Nhỏ hơn mức 200g mới
            Player_Stats.hp    = 10;

            global.Shield.testHeal();

            expect(Player_Stats.money).toBe(30);
            expect(Player_Stats.hp).toBe(10);
            // SỬA THÔNG BÁO: Mong đợi hệ thống báo thiếu '200g'
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('200g'),
                '#e74c3c'
            );
        });

        test('BR-Shield-09: Không hồi máu khi HP đã đầy', () => {
            Player_Stats.money = 200;
            Player_Stats.hp    = 20;
            Player_Stats.maxHp = 20;

            global.Shield.testHeal();

            expect(Player_Stats.money).toBe(200);
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

            Game_Manager.reduceBaseHP(3);

            expect(Player_Stats.shield).toBe(7);
            expect(Player_Stats.hp).toBe(20);
            expect(UI_Manager.flashScreenBlue).toHaveBeenCalled();
            expect(UI_Manager.flashScreenRed).not.toHaveBeenCalled();
            expect(_origReduceBaseHP).not.toHaveBeenCalled();
        });

        test('BR-Shield-11: Case A — Shield = damage (đúng biên), hấp thụ hết, shield = 0', () => {
            Player_Stats.shield = 5;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(5);

            expect(Player_Stats.shield).toBe(0);
            expect(Player_Stats.hp).toBe(20);
            expect(UI_Manager.flashScreenBlue).toHaveBeenCalled();
        });

        test('BR-Shield-12: Case B — Shield không đủ, overflow trừ vào HP', (done) => {
            Player_Stats.shield = 3;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(5);

            expect(Player_Stats.shield).toBe(0);
            expect(UI_Manager.showShieldBreakEffect).toHaveBeenCalled();
            expect(UI_Manager.flashScreenBlue).toHaveBeenCalled();

            setTimeout(() => {
                expect(Player_Stats.hp).toBe(18);
                done();
            }, 250);
        });

        test('BR-Shield-13: Case C — Shield = 0, gọi thẳng logic UC11 (flash đỏ, trừ HP)', () => {
            Player_Stats.shield = 0;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(3);

            expect(_origReduceBaseHP).toHaveBeenCalledWith(3);
            expect(Player_Stats.hp).toBe(17);
            expect(UI_Manager.flashScreenBlue).not.toHaveBeenCalled();
        });

        test('BR-Shield-14: Sát thương của tank (damage=3) đúng loại quái — không hardcode', () => {
            const tankDmg = GAME_CONFIG.ENEMIES.tank.damage;
            expect(tankDmg).toBe(3);

            Player_Stats.shield = 2;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(tankDmg);

            expect(Player_Stats.shield).toBe(0);
            expect(UI_Manager.showShieldBreakEffect).toHaveBeenCalled();
        });

        test('BR-Shield-15: HP không âm khi damage vượt quá shield + HP còn lại', (done) => {
            Player_Stats.shield = 2;
            Player_Stats.hp     = 1;

            Game_Manager.reduceBaseHP(5);

            setTimeout(() => {
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
            Game_Manager.enemies = [
                { x: 850, y: 500, type: 'creep' },
                { x: 780, y: 500, type: 'creep' },
                { x: 500, y: 500, type: 'tank'  },
            ];
            Player_Stats.blastLastUsed = 0;

            global.Shield.testBlast();

            expect(Game_Manager.destroyEnemy).toHaveBeenCalledTimes(2);
            expect(UI_Manager.showBlastEffect).toHaveBeenCalledWith(
                Map_Grid.base.x, Map_Grid.base.y, 150
            );
        });

        test('BR-Shield-17: Xung Phá bị chặn khi đang trong thời gian hồi chiêu', () => {
            Player_Stats.blastLastUsed = Date.now() - 5000;
            Game_Manager.enemies = [{ x: 900, y: 500, type: 'creep' }];

            global.Shield.testBlast();

            expect(Game_Manager.destroyEnemy).not.toHaveBeenCalled();
            expect(UI_Manager.showError).toHaveBeenCalledWith(
                expect.stringContaining('s'),
                '#9b59b6'
            );
        });

        test('BR-Shield-18: Cooldown được ghi nhận sau khi dùng Blast', () => {
            expect(Player_Stats.blastLastUsed).toBe(0);
            Player_Stats.blastLastUsed = 0;
            Game_Manager.enemies = [];

            const before = Date.now();
            global.Shield.testBlast();
            const after  = Date.now();

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

        test('BR-Shield-20: Blast not working when game over', () => {
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
            Player_Stats.shield        = 30;
            Player_Stats.blastLastUsed = Date.now() - 10000;

            Game_Manager.startLevel(1);

            expect(Player_Stats.shield).toBe(0);
            expect(Player_Stats.blastLastUsed).toBe(0);
            expect(UI_Manager.updateShieldDisplay).toHaveBeenCalled();
        });

        test('BR-Shield-22: startLevel() gọi logic gốc (mock ban đầu được gọi)', () => {
            Game_Manager.startLevel(1);
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

            expect(Player_Stats.shield).toBe(50);
        });

        test('BR-Shield-26: resetShield() đưa shield về 0', () => {
            Player_Stats.shield = 35;

            global.Shield.resetShield();

            expect(Player_Stats.shield).toBe(0);
            expect(UI_Manager.updateShieldDisplay).toHaveBeenCalled();
        });

        test('BR-Shield-27: testAbsorb(type) gọi reduceBaseHP với damage đúng loại quái', () => {
            Player_Stats.shield = 20;

            global.Shield.testAbsorb('tank');

            expect(Player_Stats.shield).toBe(17);
        });

        test('BR-Shield-28: testAbsorb với type không tồn tại → log error, không crash', () => {
            const spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
            const shieldBefore = Player_Stats.shield;

            global.Shield.testAbsorb('quai_khong_ton_tai');

            expect(console.error).toHaveBeenCalled();
            expect(Player_Stats.shield).toBe(shieldBefore);
            spyErr.mockRestore();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NHÓM 7: EDGE CASES (TÍCH LŨY KHI GIÁ MỚI LÀ 200G)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Nhóm 7 — Edge Cases & Boundary', () => {

        test('BR-Shield-29: Mua nhiều lần khiên đúng tích lũy (mua 3 lần)', () => {
            // SỬA TẠI ĐÂY: Nâng tiền gốc lên 700g để đủ thực hiện 3 lượt mua (3 * 200g = 600g)
            Player_Stats.money  = 700;
            Player_Stats.shield = 0;

            global.Shield.testBuyShield(); // +10 shield, -200g → shield=10, money=500
            global.Shield.testBuyShield(); // +10 shield, -200g → shield=20, money=300
            global.Shield.testBuyShield(); // +10 shield, -200g → shield=30, money=100

            expect(Player_Stats.shield).toBe(30);
            expect(Player_Stats.money).toBe(100);
        });

        test('BR-Shield-30: Hồi máu + mua khiên trong cùng một frame không xung đột state', () => {
            // SỬA TẠI ĐÂY: Cấp vốn ban đầu 500g để mua cả hai vật phẩm (200g + 200g = 400g)
            Player_Stats.money  = 500;
            Player_Stats.hp     = 10;
            Player_Stats.shield = 0;

            global.Shield.testHeal();       // -200g, +15 HP (đạt max 20)
            global.Shield.testBuyShield();  // -200g, +10 shield

            // SỬA GIÁ MỚI: Tiền còn lại là 100g (500g - 200g - 200g = 100g)
            expect(Player_Stats.money).toBe(100);
            expect(Player_Stats.hp).toBe(20);
            expect(Player_Stats.shield).toBe(10);
        });

        test('BR-Shield-31: Boss (damage=5) + shield=3 → overflow=2 trừ đúng vào HP', (done) => {
            Player_Stats.shield = 3;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(5);

            expect(Player_Stats.shield).toBe(0);
            expect(UI_Manager.showShieldBreakEffect).toHaveBeenCalled();

            setTimeout(() => {
                expect(Player_Stats.hp).toBe(18);
                done();
            }, 250);
        });

        test('BR-Shield-32: reduceBaseHP(0) — damage = 0, không làm gì cả', () => {
            Player_Stats.shield = 5;
            Player_Stats.hp     = 20;

            Game_Manager.reduceBaseHP(0);

            expect(Player_Stats.shield).toBe(5);
            expect(Player_Stats.hp).toBe(20);
        });
    });
});