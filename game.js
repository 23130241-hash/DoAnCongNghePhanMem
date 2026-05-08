/* =====================================================================
 * 📄 game.js — KINGDOM DEFENSE (Pro Edition, Refactored)
 * ---------------------------------------------------------------------
 * Kiến trúc MVC nhẹ:
 *   - MODEL:      Player_Stats, Map_Grid, Tower
 *   - CONTROLLER: Game_Manager (cập nhật state, vòng lặp)
 *   - VIEW:       UI_Manager   (canvas + DOM + input)
 *
 * Use case trọng tâm: "Kẻ thù lọt vào căn cứ"
 *   → Bám sát Sequence Diagram: updatePosition → checkBaseCollision
 *     → destroy → reduceBaseHP → updateHPDisplay → checkGameOver
 *     → (alt) stopGameLoop + showGameOverScreen.
 * ===================================================================== */

let currentLevel = 1;

/* ---------------------------------------------------------------------
 * Save_Manager — Lưu/đọc localStorage (đáp ứng [BO-03] OFFLINE PLAY +
 * "Tiến trình lưu cục bộ" trong Non-Functional Requirements).
 * ------------------------------------------------------------------- */
const Save_Manager = {
    key: "KINGDOM_DEFENSE_DATA",
    save() {
        try { localStorage.setItem(this.key, JSON.stringify(GAME_CONFIG.SAVE_DATA)); }
        catch (e) { console.warn("Save lỗi:", e); }
    },
    load() {
        try {
            const raw = localStorage.getItem(this.key);
            if (raw) Object.assign(GAME_CONFIG.SAVE_DATA, JSON.parse(raw));
        } catch (e) { console.warn("Load lỗi:", e); }
    },
    addStars(levelId, stars) {
        const prev = GAME_CONFIG.SAVE_DATA.completedLevels[levelId] || 0;
        if (stars > prev) {
            GAME_CONFIG.SAVE_DATA.totalStars += (stars - prev);
            GAME_CONFIG.SAVE_DATA.completedLevels[levelId] = stars;
            this.save();
        }
    }
};

// =====================================================================
// 1. MODEL — QUẢN LÝ DỮ LIỆU
// =====================================================================

const Player_Stats = {
    hp: 0, maxHp: 0, money: 0, wave: 0, maxWaves: 0,

    /** Khởi tạo lại theo level (gọi mỗi khi vào màn / chơi lại). */
    initFromLevel(levelId) {
        const lv = GAME_CONFIG.LEVELS[levelId];
        this.hp = lv.startHP;
        this.maxHp = lv.startHP;
        this.money = lv.startMoney;
        this.wave = 0;
        this.maxWaves = lv.waves.length;
    },
    checkMoney(cost) { return this.money >= cost; },
    deductMoney(cost) { this.money -= cost; },
    addMoney(amount) { this.money += amount; },
    addGold(amount) { this.money += amount; } // Alias for Sequence Diagram
};

/** --------------------------------------------------------------------
 * Enemy — Đối tượng kẻ thù ([Sequence] Enemy)
 * ------------------------------------------------------------------ */
class Enemy {
    constructor(config) {
        Object.assign(this, config);
    }

    /** [Sequence #6] Nhận sát thương */
    takeDamage(dmg) {
        this.hp -= dmg;
        return this.hp;
    }

    /** [Sequence #8, #9] Xử lý khi bị tiêu diệt */
    onDeath() {
        Enemy_Manager.onDeath(this);
        Player_Stats.addGold(this.reward);
    }
}

/** --------------------------------------------------------------------
 * Enemy_Manager — Quản lý danh sách kẻ thù ([Sequence] Enemy_Manager)
 * ------------------------------------------------------------------ */
const Enemy_Manager = {
    get enemies() { return Game_Manager.enemies; },

    /** [Sequence #2] Trả về danh sách enemy trong tầm bắn */
    getEnemiesInRange(x, y, range) {
        return this.enemies.filter(e => Math.hypot(e.x - x, e.y - y) <= range);
    },

    /** [Sequence #8] Xóa khỏi bản đồ */
    onDeath(enemy) {
        Game_Manager.enemies = Game_Manager.enemies.filter(e => e !== enemy);
    }
};

const Map_Grid = {
    mapId: null,
    buildSpots: [],
    occupiedSpots: [],
    path: [],
    base: null,

    /** Tải dữ liệu map từ config. */
    loadMap(mapId) {
        const map = GAME_CONFIG.MAPS[mapId];
        if (!map) { console.error(`Không tìm thấy map: ${mapId}`); return; }
        this.mapId = mapId;
        // Clone sâu để tránh sửa nhầm config gốc
        this.path = map.path.map(p => ({ ...p }));
        this.buildSpots = map.buildSpots.map(p => ({ ...p }));
        this.base = { ...map.base };
        this.occupiedSpots = [];
    },
    checkValidPosition(x, y) {
        const snap = GAME_CONFIG.GAMEPLAY.buildSpotSnapDistance;
        const spot = this.buildSpots.find(s => Math.hypot(s.x - x, s.y - y) < snap);
        if (!spot) return { valid: false, spot: null };
        const isOccupied = this.occupiedSpots.some(s => s.x === spot.x && s.y === spot.y);
        return { valid: !isOccupied, spot };
    },
    markOccupied(x, y) { this.occupiedSpots.push({ x, y }); },
    freeSpot(x, y) {
        this.occupiedSpots = this.occupiedSpots.filter(s => s.x !== x || s.y !== y);
    }
};

class Tower {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.lastShot = 0;
        this.level = 1;                     // Bắt đầu cấp 1
        this.totalSpent = 0;                // Tổng tiền đã chi (dùng cho công thức bán)
        this._applyLevelStats();
    }
    /** Đọc chỉ số tương ứng level hiện tại từ config. */
    _applyLevelStats() {
        const def = GAME_CONFIG.TOWERS[this.type];
        const stats = def.levels[this.level - 1];
        this.cost = stats.cost;
        this.range = stats.range;
        this.dmg = stats.dmg;
        this.cd = stats.cd;
        this.color = def.color;
        this.icon = stats.icon;
        this.attackType = def.attackType;
        this.explosionRadius = stats.explosionRadius || 0;
        if (this.totalSpent === 0) this.totalSpent = stats.cost;
    }
    canUpgrade() {
        return this.level < GAME_CONFIG.TOWERS[this.type].levels.length;
    }
    nextLevelStats() {
        if (!this.canUpgrade()) return null;
        return GAME_CONFIG.TOWERS[this.type].levels[this.level];
    }
    upgrade() {
        if (!this.canUpgrade()) return;
        const next = this.nextLevelStats();
        this.totalSpent += next.cost;
        this.level++;
        this._applyLevelStats();
    }
    sellPrice() {
        return Math.floor(this.totalSpent * GAME_CONFIG.TOWERS.sellRatio);
    }

    /** [Sequence #1] Cập nhật logic bắn của Tower */
    update() {
        const now = Date.now();
        if (now - this.lastShot < this.cd) return;

        // [Sequence #2] getEnemiesInRange
        const inRange = Enemy_Manager.getEnemiesInRange(this.x, this.y, this.range);

        // [Sequence #3] Tính khoảng cách, chọn mục tiêu (ưu tiên kẻ thù gần đích nhất / đi xa nhất)
        if (inRange.length > 0) {
            // Chọn mục tiêu có node cao nhất và khoảng cách tới target tiếp theo nhỏ nhất
            let target = inRange[0];
            for (let i = 1; i < inRange.length; i++) {
                if (inRange[i].node > target.node) {
                    target = inRange[i];
                } else if (inRange[i].node === target.node) {
                    const dTarget = Math.hypot(target.x - this.x, target.y - this.y);
                    const dNext = Math.hypot(inRange[i].x - this.x, inRange[i].y - this.y);
                    if (dNext < dTarget) target = inRange[i];
                }
            }

            // [Sequence #4] create Projectile
            Projectile.create(this, target);
            this.lastShot = now;
        }
    }
}

/** --------------------------------------------------------------------
 * Projectile — Đối tượng đạn ([Sequence] Projectile)
 * ------------------------------------------------------------------ */
class Projectile {
    constructor(tower, target) {
        this.x = tower.x;
        this.y = tower.y;
        this.target = target;
        this.dmg = tower.dmg;
        this.color = tower.color;
        this.attackType = tower.attackType;
        this.expRad = tower.explosionRadius;
        this.speed = GAME_CONFIG.GAMEPLAY.projectileSpeed;
        this.angle = Math.atan2(target.y - this.y, target.x - this.x);
    }

    static create(tower, target) {
        const p = new Projectile(tower, target);
        Game_Manager.projectiles.push(p);
    }

    /** [Sequence #5] Cập nhật vị trí và va chạm */
    update() {
        const targetGone = !this.target || this.target.hp <= 0
            || Game_Manager.enemies.indexOf(this.target) === -1;

        if (targetGone) {
            // Bay tiếp theo hướng cũ rồi tự biến mất
            this.x += Math.cos(this.angle) * (this.speed * 0.85);
            this.y += Math.sin(this.angle) * (this.speed * 0.85);
            if (this.x < 0 || this.x > GAME_CONFIG.GAMEPLAY.canvasWidth ||
                this.y < 0 || this.y > GAME_CONFIG.GAMEPLAY.canvasHeight) {
                return false; // Để xóa khỏi mảng
            }
            return true;
        }

        // Bay về phía Enemy
        this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // [Sequence #6] Cho đến khi va chạm
        if (Math.hypot(this.target.x - this.x, this.target.y - this.y) < 15) {
            if (this.attackType === 'aoe') {
                Game_Manager.explosions.push({
                    x: this.x, y: this.y, radius: 0,
                    maxRadius: this.expRad, alpha: 1
                });
                Game_Manager.enemies.forEach(e => {
                    if (Math.hypot(e.x - this.x, e.y - this.y) < this.expRad) {
                        e.takeDamage(this.dmg); // [Sequence #6]
                    }
                });
            } else {
                this.target.takeDamage(this.dmg); // [Sequence #6]
            }
            return false; // Va chạm xong thì xóa
        }
        return true;
    }
}

// =====================================================================
// 2. CONTROLLER — XỬ LÝ LOGIC TRUNG TÂM
// =====================================================================

const Game_Manager = {
    towers: [],
    enemies: [],
    projectiles: [],
    explosions: [],

    isPlaying: false,
    isGameOver: false,
    isVictory: false,
    isPaused: false,

    enemiesSpawnedThisWave: 0,
    _spawnInterval: null,    // ID setInterval của wave hiện tại
    _waveTimeout: null,      // ID setTimeout chờ wave kế tiếp
    _rafId: null,            // ID requestAnimationFrame của render loop

    /* ---------- Bắt đầu / Reset ---------- */

    startLevel(levelId) {
        // BUG FIX: Dọn sạch spawn intervals/timeouts cũ trước khi start mới
        // để tránh quái spawn vô hạn khi retry hoặc quay lại từ main menu
        this._clearAllTimers();

        currentLevel = levelId;
        Player_Stats.initFromLevel(levelId);
        Map_Grid.loadMap(GAME_CONFIG.LEVELS[levelId].mapId);

        this.towers = [];
        this.enemies = [];
        this.projectiles = [];
        this.explosions = [];
        this.enemiesSpawnedThisWave = 0;

        this.isPlaying = true;
        this.isGameOver = false;
        this.isVictory = false;
        this.isPaused = false;

        UI_Manager.updateUI();
        UI_Manager.hideGameOver();
        UI_Manager.hideVictory();

        this._waveTimeout = setTimeout(() => this.spawnWave(),
            GAME_CONFIG.GAMEPLAY.firstWaveDelay);
    },

    /** BUG FIX: Hàm dọn dẹp tập trung tất cả timers để tránh rò rỉ */
    _clearAllTimers() {
        if (this._spawnInterval) {
            clearInterval(this._spawnInterval);
            this._spawnInterval = null;
        }
        if (this._waveTimeout) {
            clearTimeout(this._waveTimeout);
            this._waveTimeout = null;
        }
    },

    /* ---------- Tower lifecycle ---------- */

    requestBuildTower(x, y, towerType) {
        const positionCheck = Map_Grid.checkValidPosition(x, y);
        if (!positionCheck.valid) {
            UI_Manager.showError("Vị trí không hợp lệ", "#e74c3c");
            return;
        }
        const cost = GAME_CONFIG.TOWERS[towerType].levels[0].cost;
        if (!Player_Stats.checkMoney(cost)) {
            UI_Manager.showError("Không đủ tiền", "#f1c40f");
            return;
        }
        Player_Stats.deductMoney(cost);
        this.towers.push(new Tower(positionCheck.spot.x, positionCheck.spot.y, towerType));
        Map_Grid.markOccupied(positionCheck.spot.x, positionCheck.spot.y);
        UI_Manager.updateUI();
        UI_Manager.clearSelected();
    },

    upgradeTower(tower) {
        if (!tower.canUpgrade()) {
            UI_Manager.showError("Đã đạt cấp tối đa", "#f39c12"); return;
        }
        const next = tower.nextLevelStats();
        if (!Player_Stats.checkMoney(next.cost)) {
            UI_Manager.showError("Không đủ tiền nâng cấp", "#f1c40f"); return;
        }
        Player_Stats.deductMoney(next.cost);
        tower.upgrade();
        UI_Manager.updateUI();
    },

    sellTower(tower) {
        Player_Stats.addMoney(tower.sellPrice());
        Map_Grid.freeSpot(tower.x, tower.y);
        this.towers = this.towers.filter(t => t !== tower);
        UI_Manager.updateUI();
    },

    /* =================================================================
     * SEQUENCE: "Kẻ thù lọt vào căn cứ" — TỪNG BƯỚC ĐÚNG TÊN HÀM
     * =================================================================*/

    /** [Sequence #1] Cập nhật vị trí 1 enemy theo path. */
    updateEnemyPosition(enemy) {
        const target = Map_Grid.path[enemy.node];
        if (!target) return;
        const dx = target.x - enemy.x, dy = target.y - enemy.y;
        if (Math.hypot(dx, dy) < 5) {
            enemy.node++;
        } else {
            const angle = Math.atan2(dy, dx);
            enemy.x += Math.cos(angle) * enemy.speed;
            enemy.y += Math.sin(angle) * enemy.speed;
        }
    },

    /** [Sequence #2] Kiểm tra enemy có chạm vùng an toàn căn cứ không. */
    checkBaseCollision(enemy) {
        // Tới điểm cuối đường đi
        if (enemy.node >= Map_Grid.path.length) return true;
        // Hoặc lọt vào bán kính căn cứ
        const base = Map_Grid.base;
        const hit = GAME_CONFIG.GAMEPLAY.baseHitRadius;
        return Math.hypot(base.x - enemy.x, base.y - enemy.y) < hit;
    },

    /** [Sequence #3] Hủy enemy (xóa khỏi mảng). */
    destroyEnemy(enemy) {
        this.enemies = this.enemies.filter(e => e !== enemy);
    },

    /** [Sequence #4] Trừ máu căn cứ. */
    reduceBaseHP(damage) {
        Player_Stats.hp = Math.max(0, Player_Stats.hp - damage);
    },

    /** [Sequence #6] Kiểm tra game over. */
    checkGameOver() {
        return Player_Stats.hp <= 0;
    },

    /** [Sequence #7] Dừng toàn bộ vòng lặp game. */
    stopGameLoop() {
        this.isPlaying = false;
        this.isGameOver = true;
        // BUG FIX: Dùng _clearAllTimers() thay vì xử lý rời rạc
        this._clearAllTimers();
    },

    /** Toàn bộ flow xử lý 1 enemy chạm căn cứ — đúng theo Sequence Diagram. */
    handleEnemyReachedBase(enemy) {
        // #3 destroy enemy
        this.destroyEnemy(enemy);
        // #4 trừ máu căn cứ (damage tham số hóa từ enemy config — không hardcode)
        this.reduceBaseHP(enemy.damage || 1);
        // #5 cập nhật UI + nháy đỏ
        UI_Manager.updateHPDisplay(Player_Stats.hp);
        UI_Manager.flashScreenRed();
        // #6 + alt-flow
        if (this.checkGameOver()) {
            this.stopGameLoop();                    // #7
            UI_Manager.showGameOverScreen();        // #8
        }
    },

    /* ---------- Vòng lặp chính ---------- */

    updateGameLoop() {
        if (!this.isPlaying || this.isPaused || this.isGameOver) return;

        // ---- Enemies ----
        // Duyệt một bản sao để có thể destroy ngay trong vòng lặp
        const enemiesSnapshot = this.enemies.slice();
        for (const enemy of enemiesSnapshot) {
            this.updateEnemyPosition(enemy);
            if (this.checkBaseCollision(enemy)) {
                this.handleEnemyReachedBase(enemy);
                if (this.isGameOver) return;
            }
        }

        // [Sequence #1] Tower.update()
        this.towers.forEach(t => t.update());

        // [Sequence #5] Projectile.update()
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            if (!this.projectiles[i].update()) {
                this.projectiles.splice(i, 1);
            }
        }

        // Sau khi đạn bắn, kiểm tra xem có enemy nào chết không
        this.checkEnemyDeath();

        // ---- Explosions ----
        const grow = GAME_CONFIG.GAMEPLAY.explosionGrowthRate;
        const fade = GAME_CONFIG.GAMEPLAY.explosionFadeRate;
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const ex = this.explosions[i];
            ex.radius += grow; ex.alpha -= fade;
            if (ex.alpha <= 0) this.explosions.splice(i, 1);
        }

        // ---- Victory check ----
        const currentWaveData = GAME_CONFIG.LEVELS[currentLevel].waves[Player_Stats.wave - 1];
        if (Player_Stats.wave === Player_Stats.maxWaves &&
            currentWaveData &&
            this.enemiesSpawnedThisWave >= currentWaveData.count &&
            this.enemies.length === 0) {
            this.isVictory = true;
            this.stopGameLoop();
            UI_Manager.showVictory();
        }
    },

    checkEnemyDeath() {
        // [Sequence #7, #8, #9]
        const deadEnemies = this.enemies.filter(e => e.hp <= 0);
        deadEnemies.forEach(e => e.onDeath());
        UI_Manager.updateUI();
    },

    /* ---------- Spawn waves ---------- */

    spawnWave() {
        // BUG FIX: Kiểm tra isGameOver VÀ isPlaying để dừng spawn khi cần
        if (this.isGameOver || !this.isPlaying || Player_Stats.wave >= Player_Stats.maxWaves) return;

        const waveData = GAME_CONFIG.LEVELS[currentLevel].waves[Player_Stats.wave];
        const enemyStats = GAME_CONFIG.ENEMIES[waveData.enemyType];
        if (!enemyStats) {
            console.error(`Không tìm thấy enemy type: ${waveData.enemyType}`); return;
        }

        Player_Stats.wave++;
        UI_Manager.updateUI();
        this.enemiesSpawnedThisWave = 0;

        // BUG FIX: Clear interval cũ trước khi tạo mới (phòng trường hợp double-call)
        if (this._spawnInterval) {
            clearInterval(this._spawnInterval);
            this._spawnInterval = null;
        }

        this._spawnInterval = setInterval(() => {
            // BUG FIX: Kiểm tra đầy đủ — nếu game đã kết thúc/không chơi thì clear và thoát
            if (this.isPaused) return; // Pause thì chờ, không clear
            if (this.isGameOver || !this.isPlaying) {
                clearInterval(this._spawnInterval);
                this._spawnInterval = null;
                return;
            }

            this.enemies.push(new Enemy({
                x: Map_Grid.path[0].x, y: Map_Grid.path[0].y,
                hp: enemyStats.hp, maxHp: enemyStats.hp,
                speed: enemyStats.speed,
                node: 1,
                size: enemyStats.size,
                reward: enemyStats.reward,
                damage: enemyStats.damage,
                color: enemyStats.color,
                type: waveData.enemyType
            }));
            this.enemiesSpawnedThisWave++;

            if (this.enemiesSpawnedThisWave >= waveData.count) {
                clearInterval(this._spawnInterval);
                this._spawnInterval = null;
                if (Player_Stats.wave < Player_Stats.maxWaves && this.isPlaying && !this.isGameOver) {
                    this._waveTimeout = setTimeout(
                        () => this.spawnWave(),
                        GAME_CONFIG.LEVELS[currentLevel].waveDelay
                    );
                }
            }
        }, waveData.interval);
    }
};

// =====================================================================
// 3. VIEW — QUẢN LÝ GIAO DIỆN VÀ TƯƠNG TÁC NGƯỜI DÙNG
// =====================================================================

const UI_Manager = {
    canvas: null, ctx: null,
    selectedTowerSlot: null,
    interactTower: null,
    errorTimer: null,
    flashTimer: null,

    init() {
        Save_Manager.load();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = GAME_CONFIG.GAMEPLAY.canvasWidth;
        this.canvas.height = GAME_CONFIG.GAMEPLAY.canvasHeight;

        this._bindMenuButtons();
        this._bindGameControls();
        this._bindTowerSlots();
        this._bindCanvasClick();
        this._bindTowerMenu();
        this._bindGameOverModal();

        this.updateUI();
    },

    /* ---------- Bindings ---------- */

    _bindMenuButtons() {
        document.getElementById('start-btn').onclick = () => this.enterGame(1);
    },
    _bindGameControls() {
        document.getElementById('pause-btn').onclick = () => {
            if (Game_Manager.isGameOver || Game_Manager.isVictory) return;
            Game_Manager.isPaused = !Game_Manager.isPaused;
            document.getElementById('pause-btn').innerText =
                Game_Manager.isPaused ? "▶️" : "⏸️";
        };
        document.getElementById('retry-btn').onclick = () => this.restartLevel();
        document.getElementById('restart-victory-btn').onclick = () => this.restartLevel();
        document.getElementById('next-level-btn').onclick = () => {
            const next = currentLevel + 1;
            if (GAME_CONFIG.LEVELS[next]) this.enterGame(next);
            else alert("Bạn đã hoàn thành tất cả các màn!");
        };
    },
    _bindTowerSlots() {
        document.querySelectorAll('.slot.active').forEach(slot => {
            slot.onclick = () => {
                // BUG FIX: Không cho chọn trụ khi đang pause, game over, hoặc victory
                if (Game_Manager.isPaused || Game_Manager.isGameOver || Game_Manager.isVictory) return;

                this.hideTowerMenu();
                if (slot.classList.contains('selected')) {
                    this.clearSelected();
                } else {
                    this.clearSelected();
                    slot.classList.add('selected');
                    this.selectedTowerSlot = {
                        type: slot.dataset.type,
                        cost: parseInt(slot.dataset.cost)
                    };
                }
            };
        });
    },
    _bindCanvasClick() {
        this.canvas.onclick = (e) => {
            // BUG FIX: Block tất cả canvas interaction khi pause, game over, hoặc victory
            if (Game_Manager.isPaused || Game_Manager.isGameOver || Game_Manager.isVictory) return;

            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            const hitRadius = GAME_CONFIG.GAMEPLAY.towerHitRadius;
            const clickedTower = Game_Manager.towers.find(t =>
                Math.hypot(t.x - clickX, t.y - clickY) < hitRadius);

            if (clickedTower) {
                this.clearSelected();
                this.interactTower = clickedTower;
                this.showTowerMenu(clickedTower);
                return;
            }
            this.hideTowerMenu();
            if (this.selectedTowerSlot) {
                Game_Manager.requestBuildTower(clickX, clickY, this.selectedTowerSlot.type);
            }
        };
    },
    _bindTowerMenu() {
        document.getElementById('close-menu-btn').onclick = () => this.hideTowerMenu();
        document.getElementById('sell-btn').onclick = () => {
            if (this.interactTower) Game_Manager.sellTower(this.interactTower);
            this.hideTowerMenu();
        };
        document.getElementById('upgrade-btn').onclick = () => {
            if (this.interactTower) {
                Game_Manager.upgradeTower(this.interactTower);
                if (this.interactTower) this.showTowerMenu(this.interactTower);
            }
        };
    },
    _bindGameOverModal() {
        document.getElementById('go-retry-btn').onclick = () => this.restartLevel();
        document.getElementById('go-home-btn').onclick = () => this.backToMainMenu();
    },

    /* ---------- Điều hướng màn hình ---------- */

    enterGame(levelId) {
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
        document.getElementById('pause-btn').innerText = "⏸️";

        // BUG FIX: Cancel RAF loop cũ trước khi start mới
        // Nếu không cancel, sẽ có nhiều render loop chạy song song
        // gây ra quái spawn vô hạn khi quay lại từ menu
        if (Game_Manager._rafId) {
            cancelAnimationFrame(Game_Manager._rafId);
            Game_Manager._rafId = null;
        }

        Game_Manager.startLevel(levelId);
        this.renderLoop();
    },

    restartLevel() {
        this.hideGameOver();
        this.hideVictory();
        this.clearSelected();
        this.hideTowerMenu();

        // BUG FIX: Cancel RAF loop cũ trước khi restart
        if (Game_Manager._rafId) {
            cancelAnimationFrame(Game_Manager._rafId);
            Game_Manager._rafId = null;
        }

        Game_Manager.startLevel(currentLevel);
        this.renderLoop();
    },

    backToMainMenu() {
        // BUG FIX: Cancel RAF loop khi về menu để không bị double loop khi vào lại
        if (Game_Manager._rafId) {
            cancelAnimationFrame(Game_Manager._rafId);
            Game_Manager._rafId = null;
        }

        Game_Manager.stopGameLoop();
        Game_Manager._clearAllTimers(); // Đảm bảo spawn cũng dừng
        Game_Manager.isPlaying = false;
        Game_Manager.isVictory = false;
        Game_Manager.isGameOver = false;
        Game_Manager.enemies = [];
        Game_Manager.towers = [];
        Game_Manager.projectiles = [];
        Game_Manager.explosions = [];
        this.clearSelected();
        this.hideTowerMenu();
        this.hideGameOver();
        this.hideVictory();
        document.getElementById('game-container').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
    },

    /* ---------- Tower interaction UI ---------- */

    clearSelected() {
        this.selectedTowerSlot = null;
        document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
    },
    showTowerMenu(tower) {
        const menu = document.getElementById('tower-menu');
        const upBtn = document.getElementById('upgrade-btn');
        const sellPriceEl = document.getElementById('sell-price');
        sellPriceEl.innerText = tower.sellPrice();

        if (tower.canUpgrade()) {
            const next = tower.nextLevelStats();
            upBtn.disabled = false;
            upBtn.innerText = `Nâng cấp Lv${next.lvl} (${next.cost}g)`;
        } else {
            upBtn.disabled = true;
            upBtn.innerText = "Cấp tối đa";
        }
        menu.classList.remove('hidden');
        menu.style.left = tower.x + 'px';
        menu.style.top = tower.y + 'px';
    },
    hideTowerMenu() {
        document.getElementById('tower-menu').classList.add('hidden');
        this.interactTower = null;
    },

    /* ---------- HP / Game Over / Victory ---------- */

    /** [Sequence #5] Cập nhật hiển thị HP. */
    updateHPDisplay(currentHP) {
        document.getElementById('hp-val').innerText = currentHP;
    },

    /** Hiệu ứng nháy đỏ màn hình khi enemy lọt căn cứ. */
    flashScreenRed() {
        const overlay = document.getElementById('flash-overlay');
        if (!overlay) return;
        overlay.classList.remove('flash-active');
        // Force reflow để re-trigger animation
        void overlay.offsetWidth;
        overlay.classList.add('flash-active');
        clearTimeout(this.flashTimer);
        this.flashTimer = setTimeout(
            () => overlay.classList.remove('flash-active'), 400);
    },

    /** [Sequence #8] Hiển thị popup Game Over với nút Retry / Home. */
    showGameOverScreen() {
        document.getElementById('go-wave-reached').innerText =
            `${Player_Stats.wave}/${Player_Stats.maxWaves}`;
        document.getElementById('game-over-modal').classList.remove('hidden');
    },
    hideGameOver() {
        document.getElementById('game-over-modal').classList.add('hidden');
    },

    showVictory() {
        const stars = Player_Stats.hp >= 15 ? 3 : (Player_Stats.hp >= 10 ? 2 : 1);
        Save_Manager.addStars(currentLevel, stars);
        document.getElementById('final-hp').innerText = Player_Stats.hp;
        document.getElementById('stars-display').innerText = "⭐".repeat(stars);
        document.getElementById('victory-modal').classList.remove('hidden');
    },
    hideVictory() {
        document.getElementById('victory-modal').classList.add('hidden');
    },

    /* ---------- HUD ---------- */

    updateUI() {
        document.getElementById('hp-val').innerText = Player_Stats.hp;
        document.getElementById('hp-max-val').innerText = Player_Stats.maxHp;
        document.getElementById('gold-val').innerText = Math.floor(Player_Stats.money);
        document.getElementById('wave-val').innerText =
            `${Player_Stats.wave}/${Player_Stats.maxWaves}`;
    },
    showError(msg, color) {
        const msgDiv = document.getElementById('ui-messages');
        msgDiv.innerText = `⚠️ ${msg}`;
        msgDiv.style.color = color;
        msgDiv.style.opacity = 1;
        clearTimeout(this.errorTimer);
        this.errorTimer = setTimeout(() => msgDiv.style.opacity = 0, 1500);
    },

    /* ---------- Render loop ---------- */

    renderLoop() {
        Game_Manager.updateGameLoop();
        const ctx = this.ctx;
        const map = GAME_CONFIG.MAPS[Map_Grid.mapId];
        const W = this.canvas.width, H = this.canvas.height;

        ctx.clearRect(0, 0, W, H);
        if (map) {
            ctx.fillStyle = map.background;
            ctx.fillRect(0, 0, W, H);
        }

        // Đường đi
        if (Map_Grid.path.length > 0) {
            ctx.strokeStyle = map ? map.pathColor : '#e67e22';
            ctx.lineWidth = 45; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath();
            Map_Grid.path.forEach((p, i) =>
                i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke();
            ctx.strokeStyle = map ? map.pathInnerColor : '#d35400';
            ctx.lineWidth = 35; ctx.stroke();
        }

        // Căn cứ
        if (Map_Grid.base) {
            const b = Map_Grid.base;
            ctx.fillStyle = '#2980b9';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = '30px Arial';
            ctx.fillText('🏰', b.x - 30, b.y + 10);
        }

        // Build spots
        Map_Grid.buildSpots.forEach(s => {
            const occupied = Map_Grid.occupiedSpots.some(o => o.x === s.x && o.y === s.y);
            if (!occupied) {
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(s.x - 25, s.y - 25, 50, 50);
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 2;
                ctx.strokeRect(s.x - 25, s.y - 25, 50, 50);
            }
        });

        // Towers
        Game_Manager.towers.forEach(t => {
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.arc(t.x + 2, t.y + 5, 25, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = t.color;
            ctx.beginPath(); ctx.arc(t.x, t.y, 25, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.font = '22px Arial'; ctx.fillText(t.icon, t.x - 11, t.y + 8);

            // Badge cấp độ
            if (t.level > 1) {
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath(); ctx.arc(t.x + 18, t.y - 18, 9, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#000'; ctx.font = 'bold 12px Arial';
                ctx.fillText(t.level, t.x + 14, t.y - 14);
            }

            if (this.interactTower === t) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
            }
        });

        // Enemies
        Game_Manager.enemies.forEach(e => {
            ctx.fillStyle = e.color || '#c0392b';
            ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(e.x - 6, e.y - 4, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.x + 6, e.y - 4, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillRect(e.x - 15, e.y - 25, 30, 6);
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(e.x - 15, e.y - 25, 30 * (e.hp / e.maxHp), 6);
        });

        // Projectiles
        Game_Manager.projectiles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.attackType === 'aoe' ? 8 : 5, 0, Math.PI * 2);
            ctx.fill();
        });

        // Explosions
        Game_Manager.explosions.forEach(ex => {
            ctx.fillStyle = `rgba(231, 76, 60, ${ex.alpha})`;
            ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(241, 196, 15, ${ex.alpha})`;
            ctx.lineWidth = 2; ctx.stroke();
        });

        // Pause overlay
        if (Game_Manager.isPaused) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff'; ctx.font = '50px Arial';
            ctx.fillText('ĐÃ TẠM DỪNG', 270, 300);
        }

        Game_Manager._rafId = requestAnimationFrame(() => this.renderLoop());
    }
};

window.onload = () => UI_Manager.init();