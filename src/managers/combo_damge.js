/* =====================================================================
 * 📄 uc11_combo_damage.js — XỬ LÝ COMBO DAMAGE TICK (UC11 - Bổ sung)
 * ---------------------------------------------------------------------
 * Use Case   : UC11 — Kẻ thù lọt vào căn cứ (trường hợp đặc biệt)
 * Phân loại  : Alternative Flow — Nhiều kẻ thù lọt vào cùng lúc
 * Tác nhân   : Game Loop (hệ thống), Enemy[] (nhóm)
 * Phiên bản  : v1.0
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  VẤN ĐỀ HIỆN TẠI (trước khi áp dụng module này)               ║
 * ║                                                                  ║
 * ║  Bug 1 — Game Over gọi nhiều lần:                               ║
 * ║    Scenario: 3 fast_creep chạm căn cứ cùng frame, HP = 2        ║
 * ║    Diễn tiến:                                                    ║
 * ║      enemy[0].onReachBase() → handleEnemyReachedBase()          ║
 * ║        → reduceBaseHP(1) → HP = 1                               ║
 * ║        → checkGameOver() = false → không game over              ║
 * ║      enemy[1].onReachBase() → handleEnemyReachedBase()          ║
 * ║        → reduceBaseHP(1) → HP = 0                               ║
 * ║        → checkGameOver() = true                                  ║
 * ║        → stopGameLoop() ✓                                        ║
 * ║        → showGameOverScreen() → modal mount lần 1               ║
 * ║      enemy[2].onReachBase() → handleEnemyReachedBase()  ← BUG  ║
 * ║        → vẫn chạy vì `if (this.isGameOver) return` nằm ở       ║
 * ║          đầu _tickLogic nhưng KHÔNG nằm trong vòng for(enemy)  ║
 * ║        → reduceBaseHP(1) → HP = -1 (âm, đã Math.max nhưng vẫn ║
 * ║          gọi thêm stopGameLoop + showGameOverScreen lần 2)      ║
 * ║        → DOM: modal bị classList.remove('hidden') 2+ lần,       ║
 * ║          go-wave-reached bị ghi đè, RAF bị cancelAnimationFrame  ║
 * ║          lần 2 trên null → silent error                          ║
 * ║                                                                  ║
 * ║  Bug 2 — flashScreenRed() bị nuốt animation:                   ║
 * ║    Nếu 3 quái chạm trong cùng 1 frame đồng bộ, 3 lần gọi      ║
 * ║    flashScreenRed() xảy ra trong cùng 1 call stack.             ║
 * ║    void el.offsetWidth chỉ reflow 1 lần ở lần cuối cùng.        ║
 * ║    → animation chỉ trigger 1 lần, không có "nhấp nhá liên tục" ║
 * ║                                                                  ║
 * ║  Bug 3 — Combo HP display sai:                                  ║
 * ║    updateHPDisplay() gọi 3 lần riêng lẻ nhưng DOM chỉ paint    ║
 * ║    sau toàn bộ JS call stack → người chơi chỉ thấy giá trị     ║
 * ║    cuối, không thấy tổng damage tích lũy đúng cách.             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * GIẢI PHÁP — ComboDamageQueue:
 *   Thay vì xử lý từng enemy ngay lập tức trong vòng lặp snapshot,
 *   _tickLogic đẩy mỗi enemy lọt căn cứ vào một Queue trong frame đó.
 *   Sau khi vòng for(enemy) kết thúc, flush Queue một lần duy nhất:
 *
 *   1. Tính tổng damage của toàn bộ Queue (accumulateDamage)
 *   2. Xóa từng enemy khỏi Game_Manager.enemies[] (destroyEnemy ×N)
 *   3. Trừ HP một lần duy nhất: reduceBaseHP(totalDmg)
 *   4. Cập nhật HP display và kích hoạt hiệu ứng một lần
 *   5. Nếu HP ≤ 0 → stopGameLoop() + showGameOverScreen() đúng 1 lần
 *   6. Nếu HP > 0 và combo ≥ 2 → kích hoạt hiệu ứng Combo Alert
 *
 * KIẾN TRÚC PATCH:
 *   Module này PATCH 2 điểm trong game.js:
 *     [1] Game_Manager._tickLogic() — thay vòng for gọi thẳng
 *         onReachBase() bằng ComboDamageQueue.enqueue() + flushQueue()
 *     [2] Game_Manager.handleEnemyReachedBase() — thêm guard
 *         isProcessingCombo để block direct call khi Queue đang flush
 *
 *   Load order trong index.html:
 *     <script src="./config.js"></script>
 *     <script src="./game.js"></script>
 *     <script src="./wave_manager.js"></script>
 *     <script src="./uc11_base_collision.js"></script>
 *     <script src="./uc11_combo_damage.js"></script>
 *     <script src="./campaign.js"></script>
 *
 * LUỒNG THAY THẾ — Alternative Flow (Alt D: Combo Damage):
 *   D.1  Frame bắt đầu — _tickLogic() duyệt enemiesSnapshot
 *   D.2  checkBaseCollision(enemy) = true (1 hoặc nhiều enemy)
 *   D.3  ComboDamageQueue.enqueue(enemy) ← THAY CHO enemy.onReachBase()
 *   D.4  Vòng for kết thúc — ComboDamageQueue.flushQueue()
 *   D.5  Tính tổng damage: totalDmg = Σ enemy[i].getDamage()
 *   D.6  destroyEnemy(enemy[i]) × N — xóa toàn bộ khỏi mảng
 *   D.7  reduceBaseHP(totalDmg) × 1 — trừ HP một lần
 *   D.8  updateHPDisplay(hp) × 1 — update DOM một lần
 *   D.9  flashCombo(count) — hiệu ứng theo số lượng combo
 *   D.10 [alt] HP ≤ 0 → stopGameLoop() + showGameOverScreen() × 1
 *   D.11 [alt] combo ≥ 2 và HP > 0 → showComboBanner(count, totalDmg)
 *   D.12 Queue.clear() — sẵn sàng cho frame tiếp theo
 * ===================================================================== */

(function () {
    'use strict';

    /* ==================================================================
     * CẤU HÌNH HIỆU ỨNG
     * ================================================================ */
    const COMBO_CONFIG = {
        /* Ngưỡng combo để kích hoạt hiệu ứng đặc biệt */
        COMBO_ALERT_MIN     : 2,      // ≥ 2 quái cùng frame → hiệu ứng combo
        FLASH_BASE_DURATION : 400,    // ms cho 1 flash đơn
        FLASH_STAGGER_MS    : 120,    // Khoảng cách ms giữa các flash liên tiếp
        COMBO_BANNER_MS     : 1600,   // ms hiển thị banner combo
        COMBO_BANNER_FADE   : 300,    // ms fade-out banner

        /* Màu flash theo số lượng combo */
        FLASH_COLORS: {
            1 : 'rgba(231,76,60,0.7)',    // Đỏ — 1 quái
            2 : 'rgba(231,76,60,0.85)',   // Đỏ đậm hơn — 2 quái
            3 : 'rgba(192,57,43,0.9)',    // Đỏ thẫm — 3 quái
        },
        FLASH_COLOR_MAX     : 'rgba(139,0,0,0.95)',  // ≥ 4 quái — cực đậm
    };

    /* ==================================================================
     * ComboDamageQueue — Bộ hàng đợi xử lý đồng bộ trong 1 frame
     * ================================================================ */
    const ComboDamageQueue = {

        /** Hàng đợi enemy lọt căn cứ trong frame hiện tại */
        _queue: [],

        /** Flag ngăn double-flush trong cùng 1 frame */
        _flushing: false,

        /**
         * [Alt D.3] Đưa enemy vào Queue thay vì gọi onReachBase() ngay.
         * Được gọi từ _tickLogic() khi checkBaseCollision = true.
         *
         * @param {Enemy} enemy — enemy vừa phát hiện chạm căn cứ
         */
        enqueue(enemy) {
            /* Guard: không enqueue nếu enemy đã trong queue (tránh duplicate
             * khi checkBaseCollision true nhiều frame liên tiếp trước khi
             * enemy bị xóa khỏi enemies[]) */
            if (!this._queue.includes(enemy)) {
                this._queue.push(enemy);
                console.log(
                    `[ComboDamage] enqueue ${enemy.type} ` +
                    `(dmg=${enemy.getDamage?.() ?? enemy.damage ?? 1}) ` +
                    `— queue size: ${this._queue.length}`
                );
            }
        },

        /**
         * [Alt D.4 → D.12] Xử lý toàn bộ Queue một lần sau khi
         * vòng for(enemiesSnapshot) kết thúc.
         *
         * Luồng:
         *   1. Nếu queue rỗng → không làm gì
         *   2. Tính totalDamage
         *   3. Destroy toàn bộ enemy trong queue
         *   4. Trừ HP một lần
         *   5. Kích hiệu ứng (flash, banner, shake)
         *   6. Kiểm tra Game Over — gọi đúng 1 lần
         *   7. Clear queue
         */
        flushQueue() {
            if (this._queue.length === 0) return;
            if (this._flushing) return;     // Guard tái nhập (re-entrancy)
            this._flushing = true;

            const enemies = this._queue.slice(); // snapshot để xử lý
            const count   = enemies.length;

            /* ── D.5 ── Tính tổng damage toàn bộ combo ───────────────── */
            let totalDmg = 0;
            enemies.forEach(e => {
                /* Ưu tiên getDamage() (từ uc11_base_collision.js nếu đã load),
                 * fallback về e.damage hoặc 1 */
                totalDmg += (typeof e.getDamage === 'function')
                    ? e.getDamage()
                    : (e.damage || 1);
            });

            const hpBefore = Player_Stats.hp;

            /* ── D.6 ── Xóa toàn bộ enemy khỏi Game_Manager.enemies[] ── */
            enemies.forEach(e => Game_Manager.destroyEnemy(e));

            /* ── D.7 ── Trừ HP một lần duy nhất ─────────────────────── */
            Game_Manager.reduceBaseHP(totalDmg);
            const hpAfter = Player_Stats.hp;

            console.log(
                `[ComboDamage] flush — ${count} quái, ` +
                `totalDmg=${totalDmg}, HP: ${hpBefore} → ${hpAfter}`
            );

            /* ── D.8 ── Cập nhật HP display một lần ─────────────────── */
            UI_Manager.updateHPDisplay(hpAfter);

            /* ── D.9 ── Hiệu ứng theo số lượng combo ────────────────── */
            if (count >= COMBO_CONFIG.COMBO_ALERT_MIN) {
                this._flashCombo(count);           // Flash đỏ theo cường độ
            } else {
                UI_Manager.flashScreenRed();        // Flash đơn thông thường
            }

            /* ── D.10 ── Kiểm tra Game Over — gọi đúng 1 lần ─────────── */
            if (Game_Manager.checkGameOver()) {
                Game_Manager.stopGameLoop();
                UI_Manager.showGameOverScreen();
            } else {
                /* ── D.11 ── Combo banner khi HP còn lại ─────────────── */
                if (count >= COMBO_CONFIG.COMBO_ALERT_MIN) {
                    this._showComboBanner(count, totalDmg, hpBefore, hpAfter);
                }
            }

            /* ── D.12 ── Clear queue ─────────────────────────────────── */
            this._queue = [];
            this._flushing = false;
        },

        /* ------------------------------------------------------------------
         * HIỆU ỨNG — Flash theo cường độ combo
         * ---------------------------------------------------------------- */

        /**
         * Kích hoạt flash đỏ với cường độ tỉ lệ theo số quái.
         * Với combo ≥ 2: flash liên tục, stagger nhỏ giữa các lần
         * để người chơi cảm nhận được từng con quái.
         *
         * @param {number} count — số quái trong combo
         */
        _flashCombo(count) {
            const overlay = document.getElementById('flash-overlay');
            if (!overlay) return;

            /* Xác định màu flash theo số lượng */
            const color = COMBO_CONFIG.FLASH_COLORS[count]
                || COMBO_CONFIG.FLASH_COLOR_MAX;

            /* Override màu nền của flash-overlay tạm thời */
            const prevBg = overlay.style.background;
            overlay.style.background =
                `radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, ${color} 100%)`;

            /* Số lần flash = min(count, 3) để không quá loạn */
            const flashTimes = Math.min(count, 3);

            for (let i = 0; i < flashTimes; i++) {
                setTimeout(() => {
                    /* Mỗi flash: remove → reflow → add để retrigger animation */
                    overlay.classList.remove('flash-active');
                    void overlay.offsetWidth;
                    overlay.classList.add('flash-active');

                    /* Ở flash cuối cùng: restore màu gốc */
                    if (i === flashTimes - 1) {
                        setTimeout(() => {
                            overlay.classList.remove('flash-active');
                            overlay.style.background = prevBg;
                        }, COMBO_CONFIG.FLASH_BASE_DURATION);
                    }
                }, i * COMBO_CONFIG.FLASH_STAGGER_MS);
            }
        },

        /* ------------------------------------------------------------------
         * HIỆU ỨNG — Combo Banner
         * ---------------------------------------------------------------- */

        /**
         * Hiển thị banner tổng hợp khi nhiều quái cùng lọt căn cứ.
         * Thay thế cho N lần gọi showDamageAlert() riêng lẻ.
         *
         * @param {number} count     — số quái trong combo
         * @param {number} totalDmg  — tổng damage
         * @param {number} hpBefore  — HP trước khi bị tấn công
         * @param {number} hpAfter   — HP sau khi bị tấn công
         */
        _showComboBanner(count, totalDmg, hpBefore, hpAfter) {
            /* Lấy hoặc tạo phần tử banner */
            let el = document.getElementById('uc11-combo-banner');
            if (!el) {
                el = document.createElement('div');
                el.id = 'uc11-combo-banner';
                Object.assign(el.style, {
                    position      : 'absolute',
                    top           : '72px',       /* Sát dưới top-bar */
                    left          : '50%',
                    transform     : 'translateX(-50%) translateY(-10px)',
                    fontFamily    : "'Arial Black', 'Segoe UI', sans-serif",
                    fontWeight    : 'bold',
                    textShadow    : '2px 2px 6px #000',
                    pointerEvents : 'none',
                    zIndex        : '31',
                    opacity       : '0',
                    transition    : `opacity ${COMBO_CONFIG.COMBO_BANNER_FADE}ms ease,
                                     transform ${COMBO_CONFIG.COMBO_BANNER_FADE}ms ease`,
                    padding       : '4px 14px',
                    borderRadius  : '8px',
                    background    : 'rgba(0,0,0,0.8)',
                    border        : '2px solid #e74c3c',
                    whiteSpace    : 'nowrap',
                    boxShadow     : '0 0 16px rgba(231,76,60,0.6)',
                });
                const container = document.getElementById('game-container');
                if (container) container.appendChild(el);
            }

            /* Nội dung banner tùy theo số lượng combo */
            const comboLabel = count >= 4 ? '💀 DISASTER' :
                count === 3 ? '⚠️ TRIPLE HIT' :
                    '⚡ COMBO';

            el.innerHTML =
                `<span style="color:#f1c40f;font-size:13px;">${comboLabel}</span> ` +
                `<span style="color:#e74c3c;font-size:20px;">-${totalDmg} HP</span> ` +
                `<span style="color:#bdc3c7;font-size:12px;">(${count} enemies)</span>`;

            /* Màu border tăng theo cường độ */
            el.style.borderColor = count >= 3 ? '#8b0000' : '#e74c3c';
            el.style.boxShadow   = count >= 3
                ? '0 0 24px rgba(139,0,0,0.8)'
                : '0 0 16px rgba(231,76,60,0.6)';

            /* Hiện banner với slide-in */
            clearTimeout(this._bannerTimer);
            el.style.opacity   = '1';
            el.style.transform = 'translateX(-50%) translateY(0)';

            /* Auto-hide sau COMBO_BANNER_MS */
            this._bannerTimer = setTimeout(() => {
                el.style.opacity   = '0';
                el.style.transform = 'translateX(-50%) translateY(-10px)';
            }, COMBO_CONFIG.COMBO_BANNER_MS);
        },
    };

    /* ==================================================================
     * PATCH [1] — Game_Manager._tickLogic()
     *
     * Thay thế vòng for xử lý enemy collision:
     *   CŨ:  if (checkBaseCollision) { enemy.onReachBase(); if (isGameOver) return; }
     *   MỚI: if (checkBaseCollision) { ComboDamageQueue.enqueue(enemy); }
     *        → sau vòng for: ComboDamageQueue.flushQueue()
     *
     * Điều này đảm bảo:
     *   - Không bao giờ gọi handleEnemyReachedBase() nhiều hơn 1 lần/frame
     *   - stopGameLoop() + showGameOverScreen() chỉ chạy tối đa 1 lần
     *   - Vòng for KHÔNG bị break giữa chừng — mọi enemy đều được enqueue
     *     trước khi bất kỳ xử lý damage nào diễn ra
     * ================================================================ */
    const _origTickLogic = Game_Manager._tickLogic.bind(Game_Manager);

    Game_Manager._tickLogic = function (dt) {
        /* Guard: không tick khi game đã dừng */
        if (!this.isPlaying || this.isPaused || this.isGameOver) return;

        /* ── Bước 1: Cập nhật vị trí enemy + phát hiện va chạm ──── */
        const enemiesSnapshot = this.enemies.slice();
        for (const enemy of enemiesSnapshot) {
            enemy.updateEffects(dt);
            this.updateEnemyPosition(enemy);

            if (this.checkBaseCollision(enemy)) {
                /* [THAY ĐỔI CHÍNH] Enqueue thay vì gọi trực tiếp.
                 * Không break, không return — mọi enemy đều được gom vào queue
                 * trước khi damage được xử lý.                              */
                ComboDamageQueue.enqueue(enemy);
            }
        }

        /* ── Flush Queue — xử lý toàn bộ combo damage sau vòng for ─ */
        /* Gọi ĐỘC LẬP với vòng for, không bị ảnh hưởng bởi isGameOver
         * ở giữa vòng. flushQueue() tự set isGameOver nếu cần,
         * sau đó return từ _tickLogic() dưới đây sẽ chặn tiếp.         */
        if (ComboDamageQueue._queue.length > 0) {
            ComboDamageQueue.flushQueue();
        }

        /* Guard sau flush — nếu game over từ combo thì không chạy tiếp */
        if (this.isGameOver || this.isVictory) return;

        /* ── Bước 2–6: Phần còn lại của _tickLogic gốc ────────────── */
        /* Tháp tấn công */
        this.towers.forEach(t => t.update(dt));

        /* Đạn di chuyển */
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            if (!this.projectiles[i].update()) {
                this.projectiles.splice(i, 1);
            }
        }

        /* Spawn quái — Wave_Manager */
        Wave_Manager.update(dt);

        /* Kiểm tra quái chết */
        this.checkEnemyDeath();

        /* Hiệu ứng nổ */
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const ex = this.explosions[i];
            ex.radius += GAME_CONFIG.GAMEPLAY.explosionGrowthRate;
            ex.alpha  -= GAME_CONFIG.GAMEPLAY.explosionFadeRate;
            if (ex.alpha <= 0) this.explosions.splice(i, 1);
        }

        /* Victory check
         * [FIX Bảo 05/06] Dùng Wave_Manager.getWaveTotalCount để hỗ trợ
         * cả 3 format: simple (count), groups (sum group.count), parallel
         * (sum sub.count). Trước đây chỉ dùng (currentWaveData.count || 0)
         * → wave dạng groups/parallel có count=undefined → 0 >= 0 = true
         * → victory tức thì khi vừa sang wave cuối của Level 3 / 4.
         */
        const currentWaveData =
            GAME_CONFIG.LEVELS[currentLevel].waves[Player_Stats.wave - 1];
        const waveTotalCount = Wave_Manager.getWaveTotalCount(currentWaveData);
        if (Player_Stats.wave === Player_Stats.maxWaves &&
            currentWaveData &&
            Wave_Manager.enemiesSpawnedThisWave >= waveTotalCount &&
            this.enemies.length === 0) {
            this.isVictory = true;
            this.stopGameLoop();
            UI_Manager.showVictory();
        }
    };

    /* ==================================================================
     * PATCH [2] — Game_Manager.handleEnemyReachedBase()
     *
     * Thêm guard isProcessingCombo để block bất kỳ direct call nào
     * xảy ra trong khi ComboDamageQueue đang flush (ví dụ nếu
     * uc11_base_collision.js được load và override onReachBase()).
     *
     * Khi Queue đang flush → handleEnemyReachedBase() từ direct call
     * sẽ bị chặn với warning. Việc destroy + damage đã được Queue lo.
     * ================================================================ */
    const _origHandleEnemyReachedBase =
        Game_Manager.handleEnemyReachedBase.bind(Game_Manager);

    Game_Manager.handleEnemyReachedBase = function (enemy) {
        /* Nếu đang trong quá trình flush Queue → skip direct call.
         * Damage đã được Queue tính gộp, không cần xử lý thêm.     */
        if (ComboDamageQueue._flushing) {
            console.warn(
                `[ComboDamage] handleEnemyReachedBase() blocked ` +
                `(đang flush Queue). Enemy: ${enemy?.type}`
            );
            return;
        }

        /* Nếu game đã over (do combo flush vừa xong) → skip */
        if (this.isGameOver) {
            console.warn(
                `[ComboDamage] handleEnemyReachedBase() blocked ` +
                `(isGameOver = true). Enemy: ${enemy?.type}`
            );
            return;
        }

        /* Direct call hợp lệ (enemy đơn lẻ, không qua Queue) */
        _origHandleEnemyReachedBase(enemy);
    };

    /* ==================================================================
     * PATCH [3] — Game_Manager.startLevel() / reset
     *
     * Đảm bảo Queue được clear khi bắt đầu màn mới hoặc retry.
     * Tránh enemy từ session cũ còn sót trong Queue ảnh hưởng màn mới.
     * ================================================================ */
    const _origStartLevel = Game_Manager.startLevel.bind(Game_Manager);

    Game_Manager.startLevel = function (levelId) {
        /* Clear Queue trước khi khởi tạo màn mới */
        ComboDamageQueue._queue    = [];
        ComboDamageQueue._flushing = false;
        console.log('[ComboDamage] Queue cleared — startLevel:', levelId);
        _origStartLevel(levelId);
    };

    /* ==================================================================
     * SELF-TEST & EXPOSE
     * ================================================================ */
    (function _selfTest() {
        const errors = [];

        if (typeof Game_Manager === 'undefined')
            errors.push('Game_Manager chưa định nghĩa — load game.js trước');
        if (typeof Enemy === 'undefined')
            errors.push('Enemy chưa định nghĩa — load game.js trước');
        if (typeof UI_Manager === 'undefined')
            errors.push('UI_Manager chưa định nghĩa — load game.js trước');

        /* Verify _tickLogic đã được patch */
        const patchedSrc = Game_Manager._tickLogic.toString();
        if (!patchedSrc.includes('ComboDamageQueue')) {
            errors.push('_tickLogic chưa được patch — kiểm tra load order');
        }

        if (errors.length > 0) {
            console.error('[ComboDamage] Lỗi tích hợp:');
            errors.forEach(e => console.error('  ✗', e));
        } else {
            console.log(
                '[ComboDamage] uc11_combo_damage.js tích hợp thành công.\n' +
                '              Combo threshold: ' + COMBO_CONFIG.COMBO_ALERT_MIN +
                ' quái/frame\n' +
                '              Flash stagger: ' + COMBO_CONFIG.FLASH_STAGGER_MS + 'ms'
            );
        }
    })();

    /* Expose cho debug và unit test thủ công */
    if (typeof window !== 'undefined') {
        window.ComboDamageQueue = ComboDamageQueue;
        window.COMBO_CONFIG     = COMBO_CONFIG;

        /**
         * Hàm test thủ công — mô phỏng N quái lọt căn cứ cùng lúc.
         * Gọi trong console: ComboDamage.simulate('fast_creep', 3)
         */
        window.ComboDamage = {
            simulate(type, count) {
                if (!GAME_CONFIG?.ENEMIES?.[type]) {
                    console.error(`Không tìm thấy enemy type: ${type}`); return;
                }
                console.log(`[ComboDamage.simulate] ${count}× ${type}`);
                for (let i = 0; i < count; i++) {
                    const mock = Object.assign(
                        Object.create(Enemy.prototype),
                        {
                            type,
                            damage : GAME_CONFIG.ENEMIES[type].damage,
                            hp     : GAME_CONFIG.ENEMIES[type].hp,
                            maxHp  : GAME_CONFIG.ENEMIES[type].hp,
                            x      : 0, y: 0, node: 0, speed: 0,
                            size   : 16, reward: 0, color: '#e74c3c',
                            effects: []
                        }
                    );
                    ComboDamageQueue.enqueue(mock);
                }
                ComboDamageQueue.flushQueue();
            },
            config : COMBO_CONFIG,
            queue  : ComboDamageQueue
        };
    }

})(); /* end IIFE */