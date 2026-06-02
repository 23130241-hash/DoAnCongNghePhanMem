/* =====================================================================
 * 📄 wave_manager.js — QUẢN LÝ WAVE & BOSS
 * ---------------------------------------------------------------------
 * UC09 — Hệ thống wave nâng cao (countdown, banner, mixed-wave, boss)
 *
 * Tác nhân chính : System (tự động)
 * Mô tả          : Thay thế logic spawn cũ của Game_Manager. Quản lý
 *                  toàn bộ vòng đời wave: đếm ngược → banner → spawn
 *                  (kèm groups) → cảnh báo boss → boss HP bar.
 *
 * KIẾN TRÚC:
 *   Game_Manager._tickLogic(dt) → Wave_Manager.update(dt)
 *   Wave_Manager sử dụng delta-time (không setInterval) để dễ sub-step
 *   theo gameSpeed, đồng bộ với pattern hiện tại của Game_Manager.
 *
 * Luồng chính (09.1.x) — sẽ implement dần qua các commit:
 *   09.1.0. Countdown 3-2-1 trước wave đầu              (Commit 08)
 *   09.1.1. Banner "WAVE X" khi wave mới                (Commit 09)
 *   09.1.3. Mixed-wave spawning (format groups)         (Commit 10)
 *   09.1.7. Cảnh báo boss "BOSS APPROACHING"            (Commit 09)
 *   09.1.8. Boss HP bar overlay khi boss còn sống       (Commit 11)
 *
 * Luồng thay thế (09.2.x):
 *   09.2.1. Pause game → dừng mọi timer của Wave_Manager (Commit 12)
 *   09.2.2. Game over / retry → reset toàn bộ state      (Commit 12)
 *
 * Phụ thuộc:
 *   - game.js (Game_Manager, Enemy, Player_Stats, Map_Grid)
 *   - config.js (GAME_CONFIG.LEVELS, GAME_CONFIG.ENEMIES)
 *
 * COMMIT 07 (skeleton): Khung cơ bản, giữ nguyên hành vi spawn hiện tại.
 *                       Các tính năng UC09 sẽ được thêm dần ở commit 08-13.
 * ===================================================================== */

const Wave_Manager = {

    /* ------------------------------------------------------------------
     * CONSTANTS
     * ---------------------------------------------------------------- */
    COUNTDOWN_INTERVAL: 700,       // [09.1.0] ms mỗi số 3-2-1
    COUNTDOWN_PULSE_MS: 150,       // Khớp với transition của #wave-countdown
    BANNER_DURATION: 1500,         // [09.1.1] ms hiển thị banner "WAVE X"
    BANNER_FADE_MS: 400,           // Khớp với keyframes waSlideOut

    /* ------------------------------------------------------------------
     * STATE — Đếm ngược & spawn cơ bản
     * ---------------------------------------------------------------- */
    waveTimer: 0,                  // Đếm ngược (ms) tới wave kế tiếp
    spawnTimer: 0,                 // Đếm ngược (ms) tới quái kế tiếp
    enemiesSpawnedThisWave: 0,     // Số quái đã spawn ở wave hiện tại

    /* ------------------------------------------------------------------
     * STATE — Các tính năng UC09 (placeholder, implement dần)
     * ---------------------------------------------------------------- */
    countdownTimer: 0,             // [Commit 08] Countdown 3-2-1
    countdownNumber: 0,            // [Commit 08] Số hiển thị hiện tại
    bannerTimer: 0,                // [Commit 09] Thời gian hiển thị banner
    bossWarningTimer: 0,           // [Commit 09] Cảnh báo boss
    groupIndex: 0,                 // [Commit 10] Index của group đang spawn
    groupSpawnedCount: 0,          // [Commit 10] Số quái spawned của group hiện tại
    currentBoss: null,             // [Commit 11] Reference đến boss enemy đang sống

    /* ==================================================================
     * LIFECYCLE
     * ================================================================ */

    /**
     * Bắt đầu một level mới. Được gọi từ Game_Manager.startLevel().
     * Reset toàn bộ state và mở đếm ngược tới wave đầu tiên.
     */
    startLevel(levelId) {
        this.reset();
        this.waveTimer = GAME_CONFIG.GAMEPLAY.firstWaveDelay;
    },

    /**
     * Reset toàn bộ state — dùng khi retry, về menu, hoặc game over.
     * [UC09 - 09.2.2]
     */
    reset() {
        this.waveTimer = 0;
        this.spawnTimer = 0;
        this.enemiesSpawnedThisWave = 0;
        this.countdownTimer = 0;
        this.countdownNumber = 0;
        this.bannerTimer = 0;
        this.bossWarningTimer = 0;
        this.groupIndex = 0;
        this.groupSpawnedCount = 0;
        this.currentBoss = null;

        // [UC09 - 09.2.2] Ẩn UI countdown + banner khi reset (retry / về menu)
        this._hideCountdown();
        this._hideBanner();
    },

    /* ==================================================================
     * UPDATE LOOP — gọi từ Game_Manager._tickLogic(dt)
     * ================================================================ */

    /**
     * Tick chính, được gọi mỗi frame (delta-time).
     * [UC09 - 09.2.1] Tự động dừng khi pause / game over.
     */
    update(dt) {
        // Guard: không tick khi game không chạy
        if (Game_Manager.isPaused) return;
        if (Game_Manager.isGameOver) return;
        if (!Game_Manager.isPlaying) return;
        if (Player_Stats.wave > Player_Stats.maxWaves) return;

        // [UC09 - 09.1.0] Nếu đang đếm ngược 3-2-1 → chỉ tick countdown,
        // tạm dừng spawn cho tới khi đếm xong.
        if (this.countdownTimer > 0) {
            this._updateCountdown(dt);
            return;
        }

        // [UC09 - 09.1.1] Banner tick song song với spawn — không block.
        if (this.bannerTimer > 0) {
            this._updateBanner(dt);
        }

        // [Commit 07] Logic spawn cơ bản (groups/boss-bar sẽ thêm sau).
        this._updateBasicSpawn(dt);
    },

    /* ==================================================================
     * SPAWN LOGIC — chuyển từ Game_Manager (giữ nguyên hành vi)
     * ================================================================ */

    _updateBasicSpawn(dt) {
        // Nếu đang chờ giữa hai wave → đếm ngược tới countdown 3-2-1
        if (this.waveTimer > 0) {
            this.waveTimer -= dt;
            if (this.waveTimer <= 0) {
                // [UC09 - 09.1.0] Kích hoạt countdown trước khi spawn wave mới
                this._beginCountdown();
            }
            return;
        }

        const waveData = GAME_CONFIG.LEVELS[currentLevel].waves[Player_Stats.wave - 1];
        if (!waveData) return;

        // [TODO Commit 10] Xử lý format groups ở đây
        const count = waveData.count || 0;

        // Đang trong quá trình spawn quái của wave hiện tại
        if (this.enemiesSpawnedThisWave < count) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this._spawnEnemy(waveData.enemyType);
                this.spawnTimer = waveData.interval;
            }
        } else if (Game_Manager.enemies.length === 0 &&
                   Player_Stats.wave < Player_Stats.maxWaves) {
            // Hết quái wave hiện tại → chờ wave sau
            this.waveTimer = GAME_CONFIG.LEVELS[currentLevel].waveDelay || 3000;
        }
    },

    _startNextWave() {
        if (Player_Stats.wave >= Player_Stats.maxWaves) return;
        Player_Stats.wave++;
        UI_Manager.updateUI();
        this.enemiesSpawnedThisWave = 0;
        this.spawnTimer = 0;
        // [TODO Commit 10] Reset groupIndex, groupSpawnedCount

        // [UC09 - 09.1.1 / 09.1.7] Trigger banner cho wave mới (boss → đỏ)
        const waveData = GAME_CONFIG.LEVELS[currentLevel].waves[Player_Stats.wave - 1];
        this._showWaveBanner(waveData);
    },

    /**
     * Tạo Enemy mới ở điểm spawn và đẩy vào danh sách của Game_Manager.
     * [Sequence 09.1.6]
     */
    _spawnEnemy(type) {
        const enemyStats = GAME_CONFIG.ENEMIES[type];
        if (!enemyStats) {
            console.error(`[Wave_Manager] Không tìm thấy enemy type: ${type}`);
            return;
        }
        const enemy = new Enemy({
            x: Map_Grid.path[0].x, y: Map_Grid.path[0].y,
            hp: enemyStats.hp, maxHp: enemyStats.hp,
            speed: enemyStats.speed,
            node: 1,
            size: enemyStats.size,
            reward: enemyStats.reward,
            damage: enemyStats.damage,
            color: enemyStats.color,
            type: type,
            isBoss: enemyStats.isBoss === true     // [Commit 11] Đánh dấu boss
        });
        Game_Manager.enemies.push(enemy);
        this.enemiesSpawnedThisWave++;

        // [TODO Commit 11] Nếu là boss → gán this.currentBoss = enemy
    },

    /* ==================================================================
     * COUNTDOWN 3-2-1 — [UC09 - 09.1.0]
     * ================================================================ */

    /**
     * Bắt đầu chuỗi đếm ngược 3 → 2 → 1 trước khi vào wave mới.
     * Gọi khi waveTimer về 0. Không countdown nếu đã hết wave.
     */
    _beginCountdown() {
        if (Player_Stats.wave >= Player_Stats.maxWaves) return;
        this.countdownNumber = 3;
        this.countdownTimer = this.COUNTDOWN_INTERVAL;
        this._showCountdownNumber(this.countdownNumber);
    },

    /**
     * Tick countdown — giảm số khi hết interval. Khi đếm xuống 0
     * thì ẩn UI và bắt đầu wave tiếp theo.
     */
    _updateCountdown(dt) {
        this.countdownTimer -= dt;
        if (this.countdownTimer > 0) return;

        this.countdownNumber--;
        if (this.countdownNumber <= 0) {
            // Đếm xong → bắt đầu wave
            this._hideCountdown();
            this._startNextWave();
        } else {
            // Vẫn còn số → hiển thị số kế tiếp
            this._showCountdownNumber(this.countdownNumber);
            this.countdownTimer = this.COUNTDOWN_INTERVAL;
        }
    },

    /**
     * Hiển thị 1 số countdown kèm pulse animation.
     * Trigger animation bằng cách remove+reflow+add class.
     */
    _showCountdownNumber(n) {
        const el = document.getElementById('wave-countdown');
        if (!el) return;
        el.textContent = String(n);
        el.classList.remove('hidden');

        // Retrigger pulse animation
        el.classList.remove('cd-pulse');
        void el.offsetWidth;          // force reflow
        el.classList.add('cd-pulse');
        setTimeout(() => {
            if (el) el.classList.remove('cd-pulse');
        }, this.COUNTDOWN_PULSE_MS);
    },

    _hideCountdown() {
        const el = document.getElementById('wave-countdown');
        if (el) el.classList.add('hidden');
    },

    /* ==================================================================
     * BANNER — [UC09 - 09.1.1 / 09.1.7] WAVE X & BOSS APPROACHING
     * ================================================================ */

    /**
     * Hiển thị banner wave mới. Tự chọn style thường (vàng) hoặc
     * boss (đỏ + pulse) dựa vào _isBossWave().
     */
    _showWaveBanner(waveData) {
        const el = document.getElementById('wave-announcement');
        if (!el) return;

        const isBoss = this._isBossWave(waveData);
        const cur = Player_Stats.wave;
        const max = Player_Stats.maxWaves;

        // Inject HTML theo cấu trúc CSS đã định nghĩa sẵn
        if (isBoss) {
            el.innerHTML =
                '<span class="wa-warn-icon">⚠️</span>' +
                '<span class="wa-boss-label">BOSS APPROACHING</span>' +
                '<span class="wa-boss-sub">Wave ' + cur + ' / ' + max + '</span>';
        } else {
            el.innerHTML =
                '<span class="wa-label">WAVE</span>' +
                '<span class="wa-number">' + cur + '</span>' +
                '<span class="wa-total">/ ' + max + '</span>';
        }

        // Reset class trước khi áp dụng class mới
        el.classList.remove('hidden', 'wa-in', 'wa-out', 'wa-normal', 'wa-boss');
        // Force reflow để retrigger animation
        void el.offsetWidth;
        el.classList.add(isBoss ? 'wa-boss' : 'wa-normal', 'wa-in');

        this.bannerTimer = this.BANNER_DURATION;
    },

    /**
     * Tick banner — hết thời gian hiển thị thì kích slide-out + ẩn.
     */
    _updateBanner(dt) {
        this.bannerTimer -= dt;
        if (this.bannerTimer > 0) return;

        const el = document.getElementById('wave-announcement');
        if (!el) return;

        // Kích slide-out (giữ wa-normal/wa-boss để background không nhảy)
        el.classList.remove('wa-in');
        el.classList.add('wa-out');
        setTimeout(() => {
            if (!el) return;
            el.classList.add('hidden');
            el.classList.remove('wa-out', 'wa-normal', 'wa-boss');
        }, this.BANNER_FADE_MS);
    },

    _hideBanner() {
        const el = document.getElementById('wave-announcement');
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('wa-in', 'wa-out', 'wa-normal', 'wa-boss');
    },

    /* ==================================================================
     * HELPERS — sẽ được dùng ở commit sau
     * ================================================================ */

    /**
     * [Commit 09] Kiểm tra wave hiện tại có boss để hiện cảnh báo đỏ.
     * Hỗ trợ cả format cũ (enemyType) lẫn format mới (groups).
     */
    _isBossWave(waveData) {
        if (!waveData) return false;
        if (waveData.enemyType) {
            const stats = GAME_CONFIG.ENEMIES[waveData.enemyType];
            return !!(stats && stats.isBoss);
        }
        if (Array.isArray(waveData.groups)) {
            return waveData.groups.some(g => {
                const stats = GAME_CONFIG.ENEMIES[g.enemyType];
                return stats && stats.isBoss;
            });
        }
        return false;
    }
};

// Cho phép debug ở console
if (typeof window !== 'undefined') window.Wave_Manager = Wave_Manager;
