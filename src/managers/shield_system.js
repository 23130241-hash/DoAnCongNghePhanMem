/* =====================================================================
 * 📄 shield_system.js — CƠ CHẾ KHIÊN NĂNG LƯỢNG (Base Shield Mechanics)
 * ---------------------------------------------------------------------
 * Use Case  : UC11 — Khiên bảo vệ Căn cứ
 * Phiên bản : v2.0 — Fix toàn bộ bug gold/cooldown/heal
 *
 * BUG ĐÃ SỬA (v1 → v2):
 *   [BUG 1] Không mua được shield dù đủ tiền
 *     NGUYÊN NHÂN: Check `Player_Stats.gold` — field không tồn tại.
 *     Field thực tế trong Player_Stats là `Player_Stats.money`.
 *     SỬA: Dùng Player_Stats.checkMoney(cost) / Player_Stats.deductMoney(cost)
 *          — đúng API đã có sẵn trong game.js.
 *
 *   [BUG 2] Mua heal không trừ tiền
 *     NGUYÊN NHÂN: Gọi `Player_Stats.gold -= cost` → không có effect.
 *     Đồng thời gọi `UI_Manager.updateGoldDisplay()` không tồn tại.
 *     SỬA: Dùng Player_Stats.deductMoney(cost) + UI_Manager.updateUI().
 *
 *   [BUG 3] Xung Phá không có thời gian hồi chiêu
 *     NGUYÊN NHÂN: _startBlastCooldownUI() dùng setTimeout lồng nhau
 *     nhưng không có vòng lặp liên tục — chỉ tick 1 lần rồi dừng.
 *     SỬA: Dùng setInterval để đếm ngược liên tục + clearInterval đúng chỗ.
 *
 *   [BUG 4] showMessage / updateGoldDisplay không tồn tại
 *     NGUYÊN NHÂN: Gọi UI_Manager.showMessage() — hàm không có trong game.js.
 *     SỬA: Dùng UI_Manager.showError(msg, color) — hàm có sẵn trong game.js.
 *
 *   [BUG 5] Shield không reset khi startLevel / retry
 *     NGUYÊN NHÂN: Patch Game_Manager.startGame() không tồn tại.
 *     SỬA: Patch Game_Manager.startLevel() — hàm thực sự được gọi.
 *
 * ===================================================================== */

(function () {
    'use strict';

    /* ==================================================================
     * CẤU HÌNH MODULE
     * ================================================================ */
    const SHIELD_CONFIG = {
        SHIELD_BUY_COST   : 200,      // Gold mua 1 lần khiên trong game
        SHIELD_BUY_AMOUNT : 10,      // Shield điểm nhận được mỗi lần mua
        HEAL_BUY_COST     : 200,      // Gold mua 1 lần hồi máu
        HEAL_AMOUNT       : 10,      // HP hồi lại mỗi lần mua (đúng đặc tả: +15)
        BLAST_COOLDOWN_MS : 30000,   // 30 giây cooldown kỹ năng Xung Phá
        BLAST_RADIUS      : 150,     // Bán kính tiêu diệt quái (px)
        MAX_SHIELD        : 50,      // Shield tối đa
        FLASH_BLUE_MS     : 500,     // Thời gian nháy xanh (ms)
        SHIELD_BREAK_MS   : 800,     // Thời gian hiệu ứng vỡ khiên
    };

    /* ==================================================================
     * PATCH [1] — Player_Stats
     * Thêm thuộc tính shield vào Player_Stats đang tồn tại.
     * ================================================================ */
    if (typeof Player_Stats !== 'undefined') {
        Player_Stats.shield        = 0;
        Player_Stats.maxShield     = SHIELD_CONFIG.MAX_SHIELD;
        Player_Stats.blastLastUsed = 0;   // timestamp lần dùng cuối
    }

    /* ==================================================================
     * PATCH [2] — Game_Manager.startLevel()
     *
     * Reset shield + cooldown mỗi khi vào màn mới hoặc retry.
     * Patch startLevel() — hàm thực sự được gọi (startGame không tồn tại).
     * ================================================================ */
    const _origStartLevel = Game_Manager.startLevel.bind(Game_Manager);
    Game_Manager.startLevel = function (levelId) {
        // Reset trước khi initFromLevel chạy
        Player_Stats.shield        = 0;
        Player_Stats.blastLastUsed = 0;
        _origStartLevel(levelId);
        // Cập nhật HUD ngay sau khi state reset xong
        UI_Manager.updateShieldDisplay?.();
        _refreshBlastBtn();
        console.log('[Shield] Reset — shield=0, blastCooldown cleared, level:', levelId);
    };

    /* ==================================================================
     * PATCH [3] — Game_Manager.reduceBaseHP()
     *
     * Xử lý thứ tự: shield trước → HP sau.
     *   Case A: shield >= damage → hấp thụ toàn bộ, HP nguyên, flash xanh
     *   Case B: 0 < shield < damage → trừ hết shield, overflow vào HP
     *   Case C: shield = 0 → gọi logic gốc UC11 (flash đỏ, trừ HP)
     * ================================================================ */
    const _origReduceBaseHP = Game_Manager.reduceBaseHP.bind(Game_Manager);

    Game_Manager.reduceBaseHP = function (damage) {
        const shield = Player_Stats.shield || 0;

        /* ── Case C: Không có khiên → hành xử y hệt UC11 ── */
        if (shield <= 0) {
            _origReduceBaseHP(damage);
            return;
        }

        if (shield >= damage) {
            /* ── Case A: Khiên đủ hấp thụ toàn bộ ── */
            Player_Stats.shield -= damage;
            UI_Manager.updateShieldDisplay();
            _pulseShieldBox();
            UI_Manager.flashScreenBlue();

            console.log(
                `[Shield] Hấp thụ ${damage} dmg — Shield: ${shield} → ${Player_Stats.shield}`
            );
        } else {
            /* ── Case B: Khiên không đủ — trừ hết shield, overflow vào HP ── */
            const overflow = damage - shield;
            Player_Stats.shield = 0;
            UI_Manager.updateShieldDisplay();
            UI_Manager.showShieldBreakEffect();
            UI_Manager.flashScreenBlue();

            // Delay nhỏ để 2 hiệu ứng (xanh → đỏ) không đè nhau
            setTimeout(() => {
                _origReduceBaseHP(overflow);
                UI_Manager.updateHPDisplay(Player_Stats.hp);
            }, 180);

            console.log(
                `[Shield] Khiên vỡ! overflow=${overflow} → HP: ${Player_Stats.hp}`
            );
        }
    };

    /* ==================================================================
     * PATCH [4] — UI_Manager: Thêm các hàm hiệu ứng khiên
     * ================================================================ */

    /**
     * updateShieldDisplay()
     * Cập nhật số shield trên HUD. Dùng updateUI() của game gốc
     * để đồng bộ HP, Gold, Wave cùng lúc.
     */
    UI_Manager.updateShieldDisplay = function () {
        const el = document.getElementById('shield-val');
        if (el) el.innerText = Player_Stats.shield || 0;

        // Sync trạng thái nút mua khiên
        const buyBtn = document.getElementById('shield-buy-btn');
        if (buyBtn) {
            const canBuy = Player_Stats.checkMoney(SHIELD_CONFIG.SHIELD_BUY_COST)
                && (Player_Stats.shield || 0) < SHIELD_CONFIG.MAX_SHIELD;
            buyBtn.disabled    = !canBuy;
            buyBtn.style.opacity = canBuy ? '1' : '0.5';
        }
    };

    /**
     * flashScreenBlue()
     * Nháy viền XANH khi khiên hấp thụ damage.
     * Không dùng class CSS (để không xung đột với flash-active của UC11).
     */
    UI_Manager.flashScreenBlue = function () {
        const el = document.getElementById('flash-overlay');
        if (!el) return;

        // Override màu nền tạm thời sang xanh
        el.style.background  = 'radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(52,152,219,0.7) 100%)';
        el.style.opacity     = '1';
        el.style.transition  = 'none';

        clearTimeout(this._flashBlueTimer);
        this._flashBlueTimer = setTimeout(() => {
            el.style.transition = `opacity ${SHIELD_CONFIG.FLASH_BLUE_MS}ms ease`;
            el.style.opacity    = '0';
            // Restore màu đỏ gốc sau khi fade xong
            setTimeout(() => { el.style.background = ''; }, SHIELD_CONFIG.FLASH_BLUE_MS);
        }, 100);
    };

    /**
     * showShieldBreakEffect()
     * Text "💥 KHIÊN VỠ!" xuất hiện giữa màn hình, pulse rồi biến mất.
     */
    UI_Manager.showShieldBreakEffect = function () {
        let el = document.getElementById('shield-break-vfx');
        if (!el) {
            el = document.createElement('div');
            el.id = 'shield-break-vfx';
            Object.assign(el.style, {
                position     : 'absolute',
                top          : '50%',
                left         : '50%',
                transform    : 'translate(-50%, -50%) scale(1)',
                fontSize     : '32px',
                fontWeight   : 'bold',
                color        : '#3498db',
                textShadow   : '0 0 20px #3498db, 2px 2px 6px #000',
                pointerEvents: 'none',
                zIndex       : '50',
                opacity      : '0',
                whiteSpace   : 'nowrap',
                letterSpacing: '2px',
            });
            document.getElementById('game-container')?.appendChild(el);
        }

        el.innerHTML  = '💥 KHIÊN VỠ!';
        el.style.transition = 'none';
        el.style.opacity    = '1';
        el.style.transform  = 'translate(-50%, -50%) scale(1.2)';
        void el.offsetWidth; // force reflow

        el.style.transition = `opacity ${SHIELD_CONFIG.SHIELD_BREAK_MS}ms ease,
                                transform ${SHIELD_CONFIG.SHIELD_BREAK_MS}ms ease`;
        el.style.transform  = 'translate(-50%, -60%) scale(1)';

        clearTimeout(this._shieldBreakTimer);
        this._shieldBreakTimer = setTimeout(() => {
            el.style.opacity = '0';
        }, 350);
    };

    /**
     * showBlastEffect()
     * Vòng sóng lan ra từ căn cứ — vẽ trực tiếp lên canvas.
     */
    UI_Manager.showBlastEffect = function (baseX, baseY, maxRadius) {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        let r = 0;
        const draw = () => {
            if (r > maxRadius) return;
            ctx.save();
            ctx.beginPath();
            ctx.arc(baseX, baseY, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(52,152,219,${1 - r / maxRadius})`;
            ctx.lineWidth   = 6;
            ctx.shadowBlur  = 20;
            ctx.shadowColor = '#3498db';
            ctx.stroke();
            ctx.restore();
            r += 14;
            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    };

    /* ==================================================================
     * XỬ LÝ CÁC NÚT HUD
     * ================================================================ */

    /**
     * [BUG 1 FIX] 🛡️ Mua Khiên
     * Dùng Player_Stats.checkMoney() + Player_Stats.deductMoney()
     * thay vì Player_Stats.gold (không tồn tại).
     */
    function _onBuyShield() {
        const cost = SHIELD_CONFIG.SHIELD_BUY_COST;

        if (!Player_Stats.checkMoney(cost)) {
            UI_Manager.showError(`Cần ${cost}g để mua Khiên!`, '#e74c3c');
            return;
        }
        if ((Player_Stats.shield || 0) >= SHIELD_CONFIG.MAX_SHIELD) {
            UI_Manager.showError('🛡️ Khiên đã đầy!', '#3498db');
            return;
        }

        Player_Stats.deductMoney(cost);                              // FIX: đúng API
        Player_Stats.shield = Math.min(
            SHIELD_CONFIG.MAX_SHIELD,
            (Player_Stats.shield || 0) + SHIELD_CONFIG.SHIELD_BUY_AMOUNT
        );
        UI_Manager.updateUI();                                       // FIX: cập nhật Gold + HP + Wave
        UI_Manager.updateShieldDisplay();
        UI_Manager.showError(`🛡️ +${SHIELD_CONFIG.SHIELD_BUY_AMOUNT} Khiên!`, '#3498db');

        console.log(
            `[Shield] Mua khiên — shield=${Player_Stats.shield}, money=${Player_Stats.money}`
        );
    }

    /**
     * [BUG 2 FIX] ❤️ Hồi Máu
     * Dùng Player_Stats.deductMoney() thay vì Player_Stats.gold -=.
     * Dùng UI_Manager.updateUI() thay vì updateGoldDisplay() (không tồn tại).
     */
    function _onBuyHeal() {
        const cost = SHIELD_CONFIG.HEAL_BUY_COST;

        if (!Player_Stats.checkMoney(cost)) {
            UI_Manager.showError(`Cần ${cost}g để Hồi Máu!`, '#e74c3c');
            return;
        }
        if (Player_Stats.hp >= Player_Stats.maxHp) {
            UI_Manager.showError('❤️ Máu đã đầy!', '#2ecc71');
            return;
        }

        Player_Stats.deductMoney(cost);                              // FIX: đúng API, trừ tiền thật
        const healed = Math.min(SHIELD_CONFIG.HEAL_AMOUNT, Player_Stats.maxHp - Player_Stats.hp);
        Player_Stats.hp += healed;

        UI_Manager.updateUI();                                       // FIX: sync Gold trên HUD
        UI_Manager.updateHPDisplay(Player_Stats.hp);
        UI_Manager.showError(`❤️ Hồi +${healed} HP!`, '#2ecc71');

        console.log(
            `[Shield] Hồi máu — HP=${Player_Stats.hp}/${Player_Stats.maxHp}, money=${Player_Stats.money}`
        );
    }

    /**
     * [BUG 3 FIX] ⚡ Xung Phá — Aura Blast
     * Dùng timestamp (Date.now()) để tính cooldown thay vì setTimeout lồng nhau.
     * setInterval đếm ngược chuẩn, clearInterval đúng chỗ.
     */
    function _onBlast() {
        if (!Game_Manager.isPlaying || Game_Manager.isGameOver || Game_Manager.isPaused) return;

        const now      = Date.now();
        const lastUsed = Player_Stats.blastLastUsed || 0;
        const elapsed  = now - lastUsed;

        if (elapsed < SHIELD_CONFIG.BLAST_COOLDOWN_MS) {
            const remaining = Math.ceil((SHIELD_CONFIG.BLAST_COOLDOWN_MS - elapsed) / 1000);
            UI_Manager.showError(`⚡ Hồi chiêu còn ${remaining}s`, '#9b59b6');
            return;
        }

        // Lấy tọa độ căn cứ từ Map_Grid (đang active)
        const base   = Map_Grid.base || { x: 900, y: 500 };
        const radius = SHIELD_CONFIG.BLAST_RADIUS;

        // Tiêu diệt toàn bộ quái trong bán kính căn cứ
        const toKill = Game_Manager.enemies.filter(e => {
            const dx = (e.x || 0) - base.x;
            const dy = (e.y || 0) - base.y;
            return Math.hypot(dx, dy) <= radius;
        });
        toKill.forEach(e => Game_Manager.destroyEnemy(e));

        // Hiệu ứng + thông báo
        UI_Manager.showBlastEffect(base.x, base.y, radius);
        UI_Manager.showError(`⚡ Xung Phá! Tiêu diệt ${toKill.length} kẻ thù!`, '#9b59b6');

        // Ghi timestamp → kích hoạt cooldown
        Player_Stats.blastLastUsed = now;
        _startBlastCooldownUI(SHIELD_CONFIG.BLAST_COOLDOWN_MS);    // FIX: truyền duration vào

        console.log(
            `[Shield] Xung Phá — killed=${toKill.length}, cooldown=${SHIELD_CONFIG.BLAST_COOLDOWN_MS / 1000}s`
        );
    }

    /**
     * [BUG 3 FIX] Đếm ngược cooldown trên nút Xung Phá.
     * Dùng setInterval cố định 1s thay vì setTimeout lồng nhau (không đáng tin).
     */
    function _startBlastCooldownUI(durationMs) {
        const btn = document.getElementById('blast-btn');
        if (!btn) return;

        btn.disabled     = true;
        btn.style.opacity = '0.4';

        let remaining = Math.ceil(durationMs / 1000);

        // Update ngay lập tức (không chờ 1 giây mới hiện)
        btn.innerHTML = `⏳ <span style="font-size:11px;line-height:1.3">${remaining}s</span>`;

        // Clear interval cũ nếu có (phòng trường hợp double-call)
        if (btn._cooldownInterval) clearInterval(btn._cooldownInterval);

        btn._cooldownInterval = setInterval(() => {           // FIX: setInterval không phải setTimeout
            remaining--;
            if (remaining <= 0) {
                clearInterval(btn._cooldownInterval);
                btn._cooldownInterval = null;
                btn.disabled     = false;
                btn.style.opacity = '1';
                btn.innerHTML    = `⚡ <span style="font-size:11px;line-height:1.3">Xung<br>Phá</span>`;
            } else {
                btn.innerHTML = `⏳ <span style="font-size:11px;line-height:1.3">${remaining}s</span>`;
            }
        }, 1000);
    }

    /** Reset nút Blast về trạng thái ready (gọi khi startLevel) */
    function _refreshBlastBtn() {
        const btn = document.getElementById('blast-btn');
        if (!btn) return;
        if (btn._cooldownInterval) {
            clearInterval(btn._cooldownInterval);
            btn._cooldownInterval = null;
        }
        btn.disabled      = false;
        btn.style.opacity = '1';
        btn.innerHTML     = `⚡ <span style="font-size:11px;line-height:1.3">Xung<br>Phá</span>`;
    }

    /** Pulse viền xanh của shield stat box khi bị trừ */
    function _pulseShieldBox() {
        const box = document.getElementById('shield-stat-box');
        if (!box) return;
        box.classList.remove('shield-hit');
        void box.offsetWidth;
        box.classList.add('shield-hit');
        setTimeout(() => box.classList.remove('shield-hit'), 500);
    }

    /* ==================================================================
     * PATCH [5] — HUD: Inject stat-box shield + action bar
     * ================================================================ */
    function _injectHUD() {
        if (document.getElementById('shield-stat-box')) return; // idempotent

        /* ── Shield stat box (chèn sau HP box) ── */
        const shieldBox = document.createElement('div');
        shieldBox.className = 'stat-box';
        shieldBox.id        = 'shield-stat-box';
        shieldBox.style.cssText =
            'background:rgba(52,152,219,0.2);border:1px solid #3498db;color:#3498db;';
        shieldBox.innerHTML = `🛡️ <span id="shield-val">0</span>`;
        const hpBox = document.querySelector('#top-bar .stat-box.hp');
        if (hpBox?.nextSibling) {
            hpBox.parentNode.insertBefore(shieldBox, hpBox.nextSibling);
        } else {
            document.getElementById('top-bar')?.appendChild(shieldBox);
        }

        /* ── Action bar (3 nút ở góc dưới bên phải game-container) ── */
        const bar = document.createElement('div');
        bar.id = 'shield-action-bar';
        bar.style.cssText = `
            position:absolute; bottom:8px; right:8px;
            display:flex; gap:6px; z-index:22;
        `;

        bar.innerHTML = `
            <button id="shield-buy-btn" title="Mua Khiên: ${SHIELD_CONFIG.SHIELD_BUY_COST}g → +${SHIELD_CONFIG.SHIELD_BUY_AMOUNT} Shield"
                style="${_btnStyle('#1a5276','#3498db')}">
                🛡️ <span style="font-size:11px;line-height:1.3">+${SHIELD_CONFIG.SHIELD_BUY_AMOUNT}<br>${SHIELD_CONFIG.SHIELD_BUY_COST}g</span>
            </button>
            <button id="heal-buy-btn" title="Hồi Máu: ${SHIELD_CONFIG.HEAL_BUY_COST}g → +${SHIELD_CONFIG.HEAL_AMOUNT} HP"
                style="${_btnStyle('#1a3a1a','#2ecc71')}">
                ❤️ <span style="font-size:11px;line-height:1.3">+${SHIELD_CONFIG.HEAL_AMOUNT}<br>${SHIELD_CONFIG.HEAL_BUY_COST}g</span>
            </button>
            <button id="blast-btn" title="Xung Phá — CD ${SHIELD_CONFIG.BLAST_COOLDOWN_MS / 1000}s"
                style="${_btnStyle('#1a1a3a','#9b59b6')}">
                ⚡ <span style="font-size:11px;line-height:1.3">Xung<br>Phá</span>
            </button>
        `;

        document.getElementById('game-container')?.appendChild(bar);

        /* Gắn event sau khi đã thêm vào DOM */
        document.getElementById('shield-buy-btn').onclick = _onBuyShield;
        document.getElementById('heal-buy-btn').onclick   = _onBuyHeal;
        document.getElementById('blast-btn').onclick      = _onBlast;

        UI_Manager.updateShieldDisplay();
    }

    function _btnStyle(bg, border) {
        return `background:${bg};border:2px solid ${border};border-radius:8px;` +
            `color:#fff;font-size:18px;padding:6px 10px;cursor:pointer;` +
            `display:flex;align-items:center;gap:4px;min-width:54px;` +
            `text-align:center;font-weight:bold;transition:opacity 0.2s,transform 0.1s;`;
    }

    /* ==================================================================
     * INJECT CSS
     * ================================================================ */
    (function _injectCSS() {
        if (document.getElementById('shield-system-styles')) return;
        const s = document.createElement('style');
        s.id = 'shield-system-styles';
        s.textContent = `
            #shield-stat-box.shield-hit {
                animation: shieldAbsorb 0.45s ease;
            }
            @keyframes shieldAbsorb {
                0%  { box-shadow: 0 0 0 #3498db; }
                40% { box-shadow: 0 0 20px 8px #3498db; }
                100%{ box-shadow: 0 0 0 #3498db; }
            }
            #shield-action-bar button:hover:not(:disabled) {
                transform: translateY(-2px);
                filter: brightness(1.25);
            }
            #shield-action-bar button:active:not(:disabled) {
                transform: translateY(0) scale(0.95);
            }
        `;
        document.head.appendChild(s);
    })();

    /* ==================================================================
     * WATCH GAME CONTAINER — Inject HUD khi game container visible
     * ================================================================ */
    (function _watchGameContainer() {
        const gc = document.getElementById('game-container');
        if (!gc) return;

        if (!gc.classList.contains('hidden')) {
            _injectHUD(); return;
        }
        const obs = new MutationObserver(() => {
            if (!gc.classList.contains('hidden')) {
                _injectHUD();
                obs.disconnect();
            }
        });
        obs.observe(gc, { attributes: true, attributeFilter: ['class'] });
    })();

    /* ==================================================================
     * SELF-TEST
     * ================================================================ */
    (function _selfTest() {
        const errs = [];
        if (typeof Player_Stats === 'undefined') errs.push('Player_Stats undefined');
        if (typeof Game_Manager  === 'undefined') errs.push('Game_Manager undefined');
        if (typeof UI_Manager    === 'undefined') errs.push('UI_Manager undefined');
        if (typeof Player_Stats?.checkMoney !== 'function')
            errs.push('Player_Stats.checkMoney() không tìm thấy — API mismatch');
        if (typeof Player_Stats?.deductMoney !== 'function')
            errs.push('Player_Stats.deductMoney() không tìm thấy — API mismatch');

        if (errs.length) {
            errs.forEach(e => console.error('[Shield]  ✗', e));
        } else {
            console.log(
                '[Shield] v2.0 tích hợp thành công.\n' +
                `         Shield: ${SHIELD_CONFIG.SHIELD_BUY_COST}g → +${SHIELD_CONFIG.SHIELD_BUY_AMOUNT} | ` +
                `Heal: ${SHIELD_CONFIG.HEAL_BUY_COST}g → +${SHIELD_CONFIG.HEAL_AMOUNT}HP | ` +
                `Blast CD: ${SHIELD_CONFIG.BLAST_COOLDOWN_MS / 1000}s`
            );
        }
    })();

    /* ==================================================================
     * DEBUG API — window.Shield
     * ================================================================ */
    if (typeof window !== 'undefined') {
        window.Shield = {
            config: SHIELD_CONFIG,
            addShield(n = 10) {
                Player_Stats.shield = Math.min(SHIELD_CONFIG.MAX_SHIELD, (Player_Stats.shield || 0) + n);
                UI_Manager.updateShieldDisplay();
                console.log(`[Shield.debug] shield = ${Player_Stats.shield}`);
            },
            resetShield() {
                Player_Stats.shield = 0;
                UI_Manager.updateShieldDisplay();
            },
            testAbsorb(type = 'creep') {
                const cfg = GAME_CONFIG?.ENEMIES?.[type];
                if (!cfg) { console.error(`[Shield.debug] Không tìm thấy: ${type}`); return; }
                console.log(`[Shield.debug] testAbsorb('${type}') — dmg=${cfg.damage}, shield_before=${Player_Stats.shield}, hp_before=${Player_Stats.hp}`);
                Game_Manager.reduceBaseHP(cfg.damage);
                setTimeout(() => console.log(`[Shield.debug] → shield_after=${Player_Stats.shield}, hp_after=${Player_Stats.hp}`), 250);
            },
            testBlast() { _onBlast(); },
            testHeal()  { _onBuyHeal(); },
            testBuyShield() { _onBuyShield(); }
        };
        console.log('[Shield] Debug: Shield.addShield(n) | Shield.testAbsorb(type) | Shield.testBlast()');
    }

})();