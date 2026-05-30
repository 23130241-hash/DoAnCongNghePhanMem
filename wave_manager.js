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

        // [Commit 07 - skeleton] Hiện chỉ chạy logic spawn cơ bản.
        // Các bước countdown/banner/boss-warning sẽ chèn vào pipeline
        // này ở commit 08-09.
        this._updateBasicSpawn(dt);
    },

    /* ==================================================================
     * SPAWN LOGIC — chuyển từ Game_Manager (giữ nguyên hành vi)
     * ================================================================ */

    _updateBasicSpawn(dt) {
        // Nếu đang chờ giữa hai wave → đếm ngược
        if (this.waveTimer > 0) {
            this.waveTimer -= dt;
            if (this.waveTimer <= 0) {
                this._startNextWave();
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
        // [TODO Commit 09] Trigger banner + boss warning
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
