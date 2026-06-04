/* =====================================================================
 * 📄 uc11_base_collision.js — KẺ THÙ LỌT VÀO CĂN CỨ (UC11)
 * ---------------------------------------------------------------------
 * Use Case  : UC11 — Kẻ thù lọt vào căn cứ
 * Tác nhân  : Game Loop (hệ thống), Enemy (chủ động kích hoạt)
 * Phiên bản : v2.0 — Khấu trừ sát thương động theo loại quái vật
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  THAY ĐỔI CHÍNH SO VỚI V1 (hardcode damage = 1)                ║
 * ║                                                                  ║
 * ║  • Luồng cũ: reduceBaseHP(1)          — mọi quái trừ 1 HP      ║
 * ║  • Luồng mới: reduceBaseHP(enemy.getDamage())                   ║
 * ║             Creep / Scout → 1 HP                                ║
 * ║             Skeleton      → 2 HP                                ║
 * ║             Tank          → 3 HP                                ║
 * ║             Boss          → 5 HP                                ║
 * ║                                                                  ║
 * ║  Dữ liệu đọc từ GAME_CONFIG.ENEMIES[type].damage (data-driven) ║
 * ║  Không hardcode — đáp ứng BO-02 Scalability.                    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * KIẾN TRÚC TÍCH HỢP:
 *   Module này PATCH 3 đối tượng đang chạy trong game.js:
 *     [1] Enemy.prototype  — thêm getDamage(), override onReachBase()
 *     [2] Game_Manager     — override handleEnemyReachedBase(),
 *                            destroyEnemy(), reduceBaseHP()
 *     [3] UI_Manager       — thêm showDamageAlert()
 *
 *   Thứ tự load trong index.html:
 *     <script src="./config.js"></script>
 *     <script src="./game.js"></script>
 *     <script src="./wave_manager.js"></script>
 *     <script src="./uc11_base_collision.js"></script>  ← sau game.js
 *     <script src="./campaign.js"></script>
 *     <script src="./upgrade_system.js"></script>
 *
 * LUỒNG CHÍNH (UC11 Main Flow — bám sát Sequence Diagram):
 *   11.1.0  _tickLogic()          → duyệt enemiesSnapshot mỗi frame
 *   11.1.1  updateEnemyPosition() → di chuyển enemy theo path
 *   11.1.2  checkBaseCollision()  → phát hiện chạm căn cứ / cuối path
 *   11.1.3  enemy.onReachBase()   → Enemy chủ động ủy quyền
 *   11.1.4  handleEnemyReachedBase(enemy)
 *   11.1.4a   destroyEnemy()     → xóa khỏi Game_Manager.enemies[]
 *   11.1.4b   enemy.getDamage()  → [MỚI] lấy damage đúng loại quái
 *   11.1.4c   reduceBaseHP(dmg)  → trừ HP căn cứ đúng lượng
 *   11.1.5  updateHPDisplay()    → cập nhật số HP trên top-bar
 *   11.1.6  showDamageAlert()    → [MỚI] banner "-N HP" + màu theo loại
 *   11.1.7  flashScreenRed()     → nháy đỏ vùng rìa màn hình
 *   11.1.8  checkGameOver()      → kiểm tra HP ≤ 0
 *   11.1.9  stopGameLoop()       → [alt] dừng loop nếu game over
 *   11.1.10 showGameOverScreen() → [alt] hiển thị popup Game Over
 *
 * LUỒNG THAY THẾ:
 *   Alt A — HP > 0 sau khi trừ:
 *     → Game tiếp tục, không gọi stopGameLoop()
 *   Alt B — Boss lọt căn cứ (damage ≥ 5):
 *     → showDamageAlert hiển thị màu đỏ đậm + rung màn hình
 *   Alt C — Game Over ngay lập tức:
 *     → stopGameLoop() + showGameOverScreen() như sequence diagram
 *
 * PHỤ THUỘC:
 *   - config.js (GAME_CONFIG.ENEMIES[type].damage)
 *   - game.js (Enemy, Game_Manager, UI_Manager, Player_Stats)
 * ===================================================================== */

(function () {
    'use strict';

    /* ==================================================================
     * [UC11] Hằng số cấu hình UI cho module này
     * ================================================================ */
    const UC11_CONFIG = {
        DAMAGE_ALERT_DURATION_MS : 1000,  // Thời gian hiển thị banner "-N HP"
        DAMAGE_ALERT_FADE_MS     : 300,   // Thời gian fade-out banner
        SHAKE_DURATION_MS        : 400,   // Thời gian rung màn hình (boss)
        BOSS_DAMAGE_THRESHOLD    : 4,     // Damage ≥ ngưỡng này → hiệu ứng boss

        /* Màu sắc banner theo loại quái (bám sát GAME_CONFIG.ENEMIES color) */
        DAMAGE_COLORS: {
            1: '#e67e22',   // Creep / Scout — cam
            2: '#9b59b6',   // Skeleton — tím
            3: '#2c3e50',   // Tank — xám xanh đậm
            5: '#8b0000',   // Boss — đỏ thẫm
        },
        DEFAULT_COLOR: '#e74c3c'
    };

    /* ==================================================================
     * PATCH [1] — Enemy.prototype
     *
     * Thêm getDamage() để Enemy tự cung cấp lượng sát thương đúng
     * loại quái, thay vì để Game_Manager hardcode damage = 1.
     * Override onReachBase() để thêm log debug và đảm bảo
     * forward đúng sang handleEnemyReachedBase().
     * ================================================================ */

    /**
     * [UC11 - Step 11.1.4b] getDamage()
     * Trả về lượng sát thương gây lên căn cứ dựa trên loại quái.
     *
     * Ưu tiên đọc từ:
     *   1. GAME_CONFIG.ENEMIES[this.type].damage  (nguồn chính — data-driven)
     *   2. this.damage  (đã gán khi khởi tạo Enemy qua Wave_Manager)
     *   3. 1  (fallback an toàn — không bao giờ NaN hoặc undefined)
     *
     * Lý do dùng 3 tầng fallback:
     *   - Nếu thêm quái mới vào config nhưng quên thêm damage → không crash.
     *   - this.damage là snapshot lúc spawn, getDamage() đọc live từ config
     *     → cho phép hot-reload config trong dev mà không cần restart.
     */
    Enemy.prototype.getDamage = function () {
        const configDmg = GAME_CONFIG.ENEMIES?.[this.type]?.damage;
        if (typeof configDmg === 'number' && configDmg > 0) return configDmg;
        if (typeof this.damage === 'number' && this.damage > 0) return this.damage;
        return 1;  // fallback an toàn
    };

    /**
     * [UC11 - Step 11.1.3] onReachBase() — OVERRIDE
     * Enemy chủ động ủy quyền xử lý sang handleEnemyReachedBase().
     * Giữ nguyên semantics: "Enemy tự hủy" → đúng step #3 sequence diagram.
     * Thêm debug log để dễ trace damage khi test.
     */
    const _origOnReachBase = Enemy.prototype.onReachBase;
    Enemy.prototype.onReachBase = function () {
        console.log(
            `[UC11] ${this.type} lọt căn cứ — damage: ${this.getDamage()} HP`
        );
        // Ủy quyền toàn bộ luồng xử lý sang handleEnemyReachedBase
        Game_Manager.handleEnemyReachedBase(this);
    };

    /* ==================================================================
     * PATCH [2] — Game_Manager
     *
     * Override handleEnemyReachedBase() để dùng getDamage() thay vì
     * hardcode. Tất cả bước khác giữ nguyên thứ tự đúng sequence diagram.
     * ================================================================ */

    /**
     * [UC11 - Luồng chính đầy đủ] handleEnemyReachedBase(enemy)
     *
     * Được gọi bởi enemy.onReachBase() (step 11.1.3).
     * Thực hiện đúng thứ tự 8 bước trong sequence diagram,
     * với bước 11.1.4b getDamage() là điểm thay đổi so với v1.
     *
     * @param {Enemy} enemy — enemy vừa chạm vào căn cứ
     */
    Game_Manager.handleEnemyReachedBase = function (enemy) {
        /* ── Step 11.1.4a ── Xóa enemy khỏi danh sách (destroy) */
        this.destroyEnemy(enemy);

        /* ── Step 11.1.4b ── [MỚI] Lấy damage đúng loại quái vật
         *
         * v1 (cũ):  this.reduceBaseHP(enemy.damage || 1)
         *           → nếu enemy.damage là undefined thì mặc định = 1 dù tank/boss
         *
         * v2 (mới): enemy.getDamage() đọc từ GAME_CONFIG.ENEMIES[type].damage
         *           → đúng với bảng cấu hình:
         *             creep/fast_creep → 1 HP
         *             skeleton         → 2 HP
         *             tank             → 3 HP
         *             boss             → 5 HP
         */
        const dmg = enemy.getDamage();

        /* ── Step 11.1.4c ── Trừ HP căn cứ đúng lượng */
        this.reduceBaseHP(dmg);

        /* ── Step 11.1.5 ── Cập nhật số HP hiển thị trên top-bar */
        UI_Manager.updateHPDisplay(Player_Stats.hp);

        /* ── Step 11.1.6 ── [MỚI] Banner "-N HP" màu theo loại quái */
        UI_Manager.showDamageAlert(enemy.type, dmg);

        /* ── Step 11.1.7 ── Nháy đỏ màn hình (+ rung nếu boss) */
        if (dmg >= UC11_CONFIG.BOSS_DAMAGE_THRESHOLD) {
            UI_Manager.flashScreenRed();
            UI_Manager.shakeScreen();          // Alt B — boss hiệu ứng mạnh hơn
        } else {
            UI_Manager.flashScreenRed();       // Alt A — quái thường
        }

        /* ── Step 11.1.8 ── Kiểm tra Game Over */
        if (this.checkGameOver()) {
            this.stopGameLoop();               // Step 11.1.9 — dừng loop
            UI_Manager.showGameOverScreen();   // Step 11.1.10 — popup
        }
        /* Nếu HP > 0 → không làm gì thêm, game tiếp tục (Alt A) */
    };

    /**
     * [UC11 - Step 11.1.4a] destroyEnemy(enemy) — OVERRIDE
     * Thêm log debug; logic xóa giữ nguyên.
     */
    const _origDestroyEnemy = Game_Manager.destroyEnemy.bind(Game_Manager);
    Game_Manager.destroyEnemy = function (enemy) {
        _origDestroyEnemy(enemy);
        console.log(
            `[UC11] destroyEnemy() — còn ${this.enemies.length} quái trên sân`
        );
    };

    /**
     * [UC11 - Step 11.1.4c] reduceBaseHP(damage) — OVERRIDE
     * Thêm log trước/sau để dễ verify damage đúng loại trong test.
     * Logic Math.max(0, ...) giữ nguyên để HP không âm.
     */
    const _origReduceBaseHP = Game_Manager.reduceBaseHP.bind(Game_Manager);
    Game_Manager.reduceBaseHP = function (damage) {
        const hpBefore = Player_Stats.hp;
        _origReduceBaseHP(damage);
        const hpAfter = Player_Stats.hp;
        console.log(
            `[UC11] reduceBaseHP(${damage}) — HP: ${hpBefore} → ${hpAfter}`
        );
    };

    /* ==================================================================
     * PATCH [3] — UI_Manager
     *
     * Thêm showDamageAlert() — banner "-N HP" xuất hiện góc trên,
     * màu sắc và kích thước thay đổi theo loại quái vật.
     * Thêm shakeScreen() — rung game container khi boss lọt căn cứ.
     * ================================================================ */

    /**
     * [UC11 - Step 11.1.6] showDamageAlert(enemyType, dmg)
     * Hiển thị banner "-N HP" sát dưới top-bar, tự fade sau 1 giây.
     * Màu và kích thước chữ tỉ lệ thuận với damage — boss đỏ + to hơn.
     *
     * @param {string} enemyType — key trong GAME_CONFIG.ENEMIES
     * @param {number} dmg       — số HP bị trừ
     */
    UI_Manager.showDamageAlert = function (enemyType, dmg) {
        /* Lấy hoặc tạo phần tử DOM alert (tái dùng để tránh spam DOM) */
        let el = document.getElementById('uc11-damage-alert');
        if (!el) {
            el = document.createElement('div');
            el.id = 'uc11-damage-alert';
            /* Style inline để không phụ thuộc thêm vào style.css */
            Object.assign(el.style, {
                position        : 'absolute',
                top             : '72px',      /* Sát dưới top-bar (height 70px) */
                left            : '50%',
                transform       : 'translateX(-50%)',
                fontFamily      : "'Arial Black', 'Segoe UI', sans-serif",
                fontWeight      : 'bold',
                textShadow      : '2px 2px 4px #000, 0 0 12px rgba(0,0,0,0.8)',
                pointerEvents   : 'none',
                zIndex          : '30',
                opacity         : '0',
                transition      : `opacity ${UC11_CONFIG.DAMAGE_ALERT_FADE_MS}ms ease`,
                letterSpacing   : '1px',
                whiteSpace      : 'nowrap',
            });
            /* Gắn vào game-container (absolute positioning) */
            const container = document.getElementById('game-container');
            if (container) container.appendChild(el);
        }

        /* Xác định màu theo loại quái — đọc từ GAME_CONFIG nếu có,
         * fallback về bảng UC11_CONFIG.DAMAGE_COLORS theo damage */
        const enemyCfg  = GAME_CONFIG.ENEMIES?.[enemyType];
        const color     = enemyCfg?.color
            || UC11_CONFIG.DAMAGE_COLORS[dmg]
            || UC11_CONFIG.DEFAULT_COLOR;

        /* Kích thước chữ tỉ lệ theo damage:
         *   1 dmg → 20px, 2 dmg → 24px, 3 dmg → 28px, 5 dmg → 36px */
        const fontSize  = Math.min(36, 16 + dmg * 4) + 'px';

        /* Lấy icon từ config (creep=👾, tank=🛡️, boss=👹...) */
        const icon      = enemyCfg?.icon || '⚠️';
        const enemyName = enemyCfg?.name || enemyType;

        /* Render nội dung */
        el.style.color    = color;
        el.style.fontSize = fontSize;
        el.innerHTML      = `${icon} ${enemyName} — <span style="color:#e74c3c;">-${dmg} HP</span>`;

        /* Hiển thị ngay lập tức → fade out sau DAMAGE_ALERT_DURATION_MS */
        clearTimeout(this._damageAlertTimer);
        el.style.opacity = '1';
        this._damageAlertTimer = setTimeout(() => {
            el.style.opacity = '0';
        }, UC11_CONFIG.DAMAGE_ALERT_DURATION_MS);
    };

    /**
     * [UC11 - Alt B] shakeScreen()
     * Rung nhẹ game container khi boss (damage ≥ 5) lọt căn cứ.
     * Dùng CSS animation inject-on-the-fly để không cần sửa style.css.
     */
    UI_Manager.shakeScreen = function () {
        /* Inject keyframe nếu chưa có */
        if (!document.getElementById('uc11-shake-style')) {
            const style = document.createElement('style');
            style.id = 'uc11-shake-style';
            style.textContent = `
                @keyframes uc11Shake {
                    0%,100% { transform: translate(0,0) rotate(0deg); }
                    20%     { transform: translate(-6px, 4px) rotate(-0.4deg); }
                    40%     { transform: translate(6px,-4px) rotate(0.4deg); }
                    60%     { transform: translate(-4px, 6px) rotate(-0.3deg); }
                    80%     { transform: translate(4px,-2px) rotate(0.3deg); }
                }
            `;
            document.head.appendChild(style);
        }

        const container = document.getElementById('game-container');
        if (!container) return;

        /* Reset animation (force reflow) rồi apply lại */
        container.style.animation = 'none';
        void container.offsetWidth;
        container.style.animation =
            `uc11Shake ${UC11_CONFIG.SHAKE_DURATION_MS}ms ease-in-out`;

        /* Dọn thuộc tính sau khi animation xong */
        setTimeout(() => {
            container.style.animation = '';
        }, UC11_CONFIG.SHAKE_DURATION_MS);
    };

    /* ==================================================================
     * SELF-TEST — chạy 1 lần khi file load để verify patch thành công.
     * Không làm gì nếu Enemy/Game_Manager chưa định nghĩa (load sai thứ tự).
     * ================================================================ */
    (function _selfTest() {
        const errors = [];

        if (typeof Enemy === 'undefined')
            errors.push('Enemy chưa được định nghĩa — load game.js trước');
        else if (typeof Enemy.prototype.getDamage !== 'function')
            errors.push('Enemy.prototype.getDamage CHƯA được patch');

        if (typeof Game_Manager === 'undefined')
            errors.push('Game_Manager chưa được định nghĩa — load game.js trước');

        if (typeof UI_Manager === 'undefined')
            errors.push('UI_Manager chưa được định nghĩa — load game.js trước');
        else if (typeof UI_Manager.showDamageAlert !== 'function')
            errors.push('UI_Manager.showDamageAlert CHƯA được thêm');

        if (errors.length > 0) {
            console.error('[UC11] Lỗi tích hợp:');
            errors.forEach(e => console.error('  ✗', e));
        } else {
            console.log(
                '[UC11] uc11_base_collision.js tích hợp thành công.\n' +
                '       Damage table từ config:\n' +
                Object.entries(GAME_CONFIG?.ENEMIES || {})
                    .map(([k, v]) => `         ${k.padEnd(12)} → ${v.damage} HP`)
                    .join('\n')
            );

            /* Kiểm tra nhanh getDamage() với mock enemy */
            const mockEnemy = { type: 'tank', damage: 999 };
            Object.setPrototypeOf(mockEnemy, Enemy.prototype);
            const computed = mockEnemy.getDamage();
            const expected = GAME_CONFIG?.ENEMIES?.tank?.damage || 3;
            if (computed !== expected) {
                console.warn(
                    `[UC11] getDamage() trả về ${computed}, mong đợi ${expected}`
                );
            } else {
                console.log(
                    `       getDamage() test OK — tank.getDamage() = ${computed} ✓`
                );
            }
        }
    })();

    /* Expose cho debug console */
    if (typeof window !== 'undefined') {
        window.UC11 = {
            config    : UC11_CONFIG,
            /* Hàm test thủ công: UC11.testDamage('boss') */
            testDamage(type) {
                const stats = GAME_CONFIG?.ENEMIES?.[type];
                if (!stats) { console.error(`Không tìm thấy enemy type: ${type}`); return; }
                const mock = Object.assign(
                    Object.create(Enemy.prototype),
                    { type, damage: stats.damage, hp: stats.hp, maxHp: stats.hp }
                );
                console.log(`[UC11.testDamage] ${type}.getDamage() = ${mock.getDamage()}`);
                if (typeof UI_Manager.showDamageAlert === 'function') {
                    UI_Manager.showDamageAlert(type, mock.getDamage());
                }
            }
        };
    }

})(); /* end IIFE */