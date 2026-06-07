/* =====================================================================
 * 📄 game.js — KINGDOM DEFENSE (Pro Edition, Refactored)
 * ---------------------------------------------------------------------
 * Kiến trúc MVC nhẹ:
 * ===================================================================== */

let currentLevel = 1;

/* ---------------------------------------------------------------------
 * Save_Manager — Lưu/đọc localStorage (đáp ứng [BO-03] OFFLINE PLAY +
 * "Tiến trình lưu cục bộ" trong Non-Functional Requirements).
 * ------------------------------------------------------------------- */
const Save_Manager = (typeof globalThis !== 'undefined' && globalThis.Save_Manager) ? globalThis.Save_Manager : {
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

const Player_Stats = (typeof globalThis !== 'undefined' && globalThis.Player_Stats) ? globalThis.Player_Stats : {
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
        this.baseSpeed = config.speed;
        this.effects = [];
    }

    /** Cập nhật hiệu ứng và tốc độ - Cần thiết cho logic Sub-stepping */
    /* ------------------------------------------------------------------
     * [CẢI TIẾN — UC10: Enemy nhận hiệu ứng từ tháp]
     * ------------------------------------------------------------------
     * Enemy có thể nhận hiệu ứng:
     *   - slow   : giảm tốc độ di chuyển.
     *   - poison : rút máu theo thời gian.
     * ------------------------------------------------------------------ */
    updateEffects(dt) {
        let speedMultiplier = 1;

        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.duration -= dt;

            if (effect.duration <= 0) {
                this.effects.splice(i, 1);
                continue;
            }

            if (effect.type === 'slow') {
                speedMultiplier *= effect.factor;
            }

            if (effect.type === 'poison') {
                effect.tickTimer -= dt;

                if (effect.tickTimer <= 0) {
                    this.takeDamage(effect.damage);
                    effect.tickTimer = effect.tickInterval;
                }
            }
        }

        this.speed = this.baseSpeed * speedMultiplier;
    }
    /** UC10.1 - [Sequence 10.1.19] Enemy nhận sát thương từ Projectile */
    takeDamage(dmg) {
        this.hp -= dmg;
        return this.hp;
    }

    /** UC10.1 - [Sequence 10.1.21] Enemy nhận hiệu ứng đặc biệt từ Projectile */
    applyEffect(newEffect) {
        if (!newEffect || !newEffect.type) return;

        const existing = this.effects.find(effect => effect.type === newEffect.type);

        if (!existing) {
            this.effects.push(newEffect);
            return;
        }

        existing.duration = Math.max(existing.duration || 0, newEffect.duration || 0);

        if (newEffect.type === 'slow') {
            existing.factor = Math.min(existing.factor || 1, newEffect.factor || 1);
        }

        if (newEffect.type === 'poison') {
            existing.damage = Math.max(existing.damage || 0, newEffect.damage || 0);
            existing.tickInterval = newEffect.tickInterval || existing.tickInterval || 500;
            existing.tickTimer = Math.min(
                existing.tickTimer || newEffect.tickTimer || 500,
                newEffect.tickTimer || 500
            );
        }
    }

    /** UC10.1 - [Sequence 10.1.25] Enemy thông báo trạng thái bị tiêu diệt */
    onDeath() {
        return {
            reward: this.reward
        };
    }

    /* ------------------------------------------------------------------
     * [CẢI TIẾN — Nguyễn Lê Tiến Đạt | UC11 — step #3]
     * ------------------------------------------------------------------
     * Vấn đề gốc:
     *   _tickLogic() gọi thẳng Game_Manager.handleEnemyReachedBase(enemy)
     *   khi phát hiện va chạm. Enemy hoàn toàn thụ động — Game_Manager
     *   vừa phát hiện vừa xử lý, vi phạm ngữ nghĩa sequence diagram:
     *     "Kẻ thù TỰ HỦY và xóa khỏi mảng" (step #3 là hành động của Enemy).
     *
     * Giải pháp:
     *   Thêm method onReachBase() vào Enemy. Khi _tickLogic() phát hiện
     *   va chạm (checkBaseCollision = true), nó gọi enemy.onReachBase()
     *   thay vì gọi thẳng vào Game_Manager.
     *   Enemy chủ động ủy quyền hậu quả cho Game_Manager xử lý.
     *
     *   Luồng mới (khớp sequence diagram):
     *     _tickLogic → checkBaseCollision (step #2, phát hiện va chạm)
     *       → enemy.onReachBase()           (step #3, Enemy tự phản ứng)
     *         → Game_Manager.handleEnemyReachedBase(this)
     *           → destroyEnemy(enemy)       (step #3, xóa khỏi mảng)
     *           → reduceBaseHP(damage)      (step #4, trừ máu căn cứ)
     *           → updateHPDisplay + flash   (step #5, cập nhật UI)
     *           → checkGameOver()           (step #6, kiểm tra kết thúc)
     *             → stopGameLoop()          (step #7, nếu HP ≤ 0)
     *             → showGameOverScreen()    (step #8, hiển thị popup)
     * ------------------------------------------------------------------*/
    onReachBase() {
        // Enemy tự kích hoạt chuỗi xử lý "chạm căn cứ" — đúng vai trò trong sequence
        Game_Manager.handleEnemyReachedBase(this);
    }
}

/** --------------------------------------------------------------------
 * Enemy_Manager — Quản lý danh sách kẻ thù ([Sequence] Enemy_Manager)
 * ------------------------------------------------------------------ */
const Enemy_Manager = (typeof globalThis !== 'undefined' && globalThis.Enemy_Manager) ? globalThis.Enemy_Manager : {
    get enemies() { return Game_Manager.enemies; },

    isTargetable(enemy) {
        return !!enemy
            && enemy.hp > 0
            && this.enemies.includes(enemy);
    },

    getEnemyPath(enemy) {
        const pathIndex = enemy && enemy.pathIndex !== undefined ? enemy.pathIndex : 0;
        return Map_Grid.getPath(pathIndex);
    },

    getRemainingPathDistance(enemy) {
        if (!enemy) return Number.POSITIVE_INFINITY;

        const path = this.getEnemyPath(enemy);

        if (!path || path.length === 0) return Number.POSITIVE_INFINITY;
        if (enemy.node >= path.length) return 0;

        let remaining = 0;
        const nextPoint = path[enemy.node];

        if (nextPoint) {
            remaining += Math.hypot(enemy.x - nextPoint.x, enemy.y - nextPoint.y);
        }

        for (let i = enemy.node; i < path.length - 1; i++) {
            remaining += Math.hypot(
                path[i + 1].x - path[i].x,
                path[i + 1].y - path[i].y
            );
        }

        return remaining;
    },

    /** [Sequence #2] Trả về danh sách enemy hợp lệ trong tầm bắn */
    getEnemiesInRange(x, y, range) {
        return this.enemies.filter(e =>
            this.isTargetable(e) &&
            Math.hypot(e.x - x, e.y - y) <= range
        );
    },

    /** UC10.1 - [Sequence 10.1.26] Enemy_Manager xóa Enemy khỏi danh sách quản lý */
    removeEnemy(enemy) {
        Game_Manager.enemies = Game_Manager.enemies.filter(e => e !== enemy);
    },

    /** Giữ lại để tương thích nếu code cũ còn gọi Enemy_Manager.onDeath() */
    onDeath(enemy) {
        this.removeEnemy(enemy);
    }
};

const Map_Grid = (typeof globalThis !== 'undefined' && globalThis.Map_Grid) ? globalThis.Map_Grid : {
    mapId: null,
    buildSpots: [],
    occupiedSpots: [],
    // [Commit 15] paths = mảng các path (mỗi path là mảng waypoint).
    // Map cũ chỉ có 1 path → paths.length === 1.
    // Map mới (map04 trở đi) có thể có nhiều path → paths.length ≥ 2.
    paths: [],
    base: null,

    // [Commit 15] Backward compat — code cũ truy cập Map_Grid.path[...]
    // sẽ tự lấy path đầu tiên (paths[0]). Không có setter — chỉ đọc.
    get path() {
        return this.paths[0] || [];
    },

    /**
     * [Commit 15] Trả về path theo index. Dùng cho enemy biết mình đi
     * path nào (enemy.pathIndex sẽ được implement ở Commit 17).
     */
    getPath(index = 0) {
        return this.paths[index] || [];
    },

    /** Tải dữ liệu map từ config. */
    loadMap(mapId) {
        const map = GAME_CONFIG.MAPS[mapId];

        if (!map) {
            console.error(`Không tìm thấy map: ${mapId}`);
            return;
        }

        this.mapId = mapId;
        // [Commit 15] Hỗ trợ cả 2 format:
        //   - Mới: map.paths = [[...path0...], [...path1...], ...]
        //   - Cũ:  map.path  = [...path0...]   (bọc lại thành paths)
        const rawPaths = Array.isArray(map.paths) ? map.paths
                       : (Array.isArray(map.path) ? [map.path] : []);
        // Deep clone tất cả waypoints để tránh sửa nhầm config gốc
        this.paths = rawPaths.map(path => path.map(p => ({ ...p })));
        this.buildSpots = map.buildSpots.map(p => ({ ...p }));
        this.base = { ...map.base };
        this.occupiedSpots = [];
    },

    getSpotKey(x, y) {
        return `${Math.round(x)}-${Math.round(y)}`;
    },

    findNearestBuildSpot(x, y) {
        const snapDistance = GAME_CONFIG.GAMEPLAY.buildSpotSnapDistance;

        return this.buildSpots.find(spot =>
            Math.hypot(spot.x - x, spot.y - y) <= snapDistance
        ) || null;
    },

    isSpotOccupied(spot) {
        if (!spot) return false;

        const spotKey = this.getSpotKey(spot.x, spot.y);

        return this.occupiedSpots.some(item => item.key === spotKey);
    },
    /**
     * [UC05 - Sequence #5.4.4] checkValidPosition(x,y)
     * Kiểm tra vị trí đặt tower có hợp lệ hay không
     * Tìm build spot gần nhất và kiểm tra spot đã bị chiếm chưa
     */
    checkValidPosition(x, y) {
        const spot = this.findNearestBuildSpot(x, y);

        if (!spot) {
            return {
                valid: false,
                spot: null,
                reason: "Chỉ được xây tháp tại ô xây dựng"
            };
        }

        if (this.isSpotOccupied(spot)) {
            return {
                valid: false,
                spot,
                reason: "Vị trí này đã có tháp"
            };
        }

        return {
            valid: true,
            spot,
            reason: ""
        };
    },
    markOccupied(x, y){
        const key = this.getSpotKey(x, y);

        if (!this.occupiedSpots.some(item => item.key === key)){
            this.occupiedSpots.push({x, y, key});
        }
    },
    freeSpot(x, y) {
        const key = this.getSpotKey(x, y);
        this.occupiedSpots = this.occupiedSpots.filter(item =>
            item.key !== key
        );
    }
};

class Tower {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.cooldownTimer = 0;             // Timer đếm ngược hồi chiêu
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
        this.slowFactor = stats.slowFactor || 1; // slowFactor: hệ số tốc độ còn lại của enemy sau khi bị làm chậm.
        this.slowDuration = stats.slowDuration || 0; // slowDuration: thời gian làm chậm, tính bằng mili-giây.
        // [UC10 - Cải tiến] Chỉ số riêng cho Tháp Độc.
        // poisonDmg: lượng máu enemy bị rút mỗi lần poison tick.
        // poisonDuration: tổng thời gian hiệu ứng độc tồn tại trên enemy.
        this.poisonDmg = stats.poisonDmg || 0;
        this.poisonDuration = stats.poisonDuration || 0;
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

    /** UC: Tháp tấn công kẻ thù - Cập nhật logic bắn của Tower */
    /* ------------------------------------------------------------------
 * [CẢI TIẾN — Nguyễn Thanh Phú | UC10 — Tháp tấn công kẻ thù]
 * ------------------------------------------------------------------
 * Vấn đề gốc:
 *   Tower.update() lấy danh sách Enemy trong tầm bắn rồi chọn mục tiêu
 *   theo thứ tự đầu tiên hoặc dựa nhiều vào enemy.node. Cách này chưa ổn
 *   khi có nhiều Enemy trong tầm hoặc map có nhiều đường đi khác nhau.
 *
 *   Tower có thể bắn Enemy ở phía sau, trong khi Enemy gần căn cứ hơn
 *   lại bị bỏ qua. Ngoài ra, logic chọn mục tiêu đặt trực tiếp trong
 *   update() làm luồng sequence chưa rõ ràng.
 *
 * Giải pháp:
 *   Tách logic chọn mục tiêu sang selectTarget(enemies).
 *   Tower sẽ nhận danh sách Enemy hợp lệ từ Enemy_Manager, sau đó tính
 *   khoảng cách còn lại từ từng Enemy tới căn cứ.
 *
 *   Enemy nào còn ít khoảng cách tới căn cứ hơn sẽ được ưu tiên tấn công.
 *   Nếu nhiều Enemy có mức nguy hiểm ngang nhau thì ưu tiên Enemy ít máu
 *   hơn để kết liễu nhanh hơn.
 *
 *   Luồng mới khớp sequence diagram:
 *     Game_Loop → Tower.update()
 *       → Enemy_Manager.getEnemiesInRange()
 *         → lọc Enemy còn sống, còn tồn tại và nằm trong tầm bắn
 *       → Tower.selectTarget()
 *         → tính khoảng cách còn lại tới căn cứ
 *         → chọn Enemy nguy hiểm nhất
 *       → Projectile.create(target)
 * ------------------------------------------------------------------*/
    selectTarget(enemies) {
        if (!enemies || enemies.length === 0) return null;

        return enemies.reduce((best, enemy) => {
            if (!best) return enemy;

            const bestRemaining = Enemy_Manager.getRemainingPathDistance(best);
            const enemyRemaining = Enemy_Manager.getRemainingPathDistance(enemy);

            if (enemyRemaining < bestRemaining) {
                return enemy;
            }

            if (enemyRemaining === bestRemaining && enemy.hp < best.hp) {
                return enemy;
            }

            return best;
        }, null);
    }

    /** UC: Tháp tấn công kẻ thù - Cập nhật logic bắn của Tower */
    update(dt) {
        if (this.cooldownTimer > 0) {
            this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
        }

        if (this.cooldownTimer > 0) return;

        // [Sequence 10.1.2] Tower yêu cầu Enemy_Manager cung cấp danh sách kẻ địch hợp lệ trong tầm.
        const inRange = Enemy_Manager.getEnemiesInRange(this.x, this.y, this.range);

        // [Sequence 10.1.3] Tower chọn Enemy nguy hiểm nhất để tấn công.
        const target = this.selectTarget(inRange);

        if (!target) return;

        // [Sequence 10.1.4] Khởi tạo Projectile với mục tiêu đã chọn.
        Projectile.create(this, target);
        this.cooldownTimer = this.cd;
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
        // [UC10 - Cải tiến] Projectile lưu thông tin làm chậm từ Tháp Phép Thuật.
        // Khi attackType = 'magic', các chỉ số này sẽ được gắn vào enemy.
        this.slowFactor = tower.slowFactor || 1;
        this.slowDuration = tower.slowDuration || 0;

        // [UC10 - Cải tiến] Projectile lưu chỉ số độc từ Tháp Độc.
        // Khi attackType = 'poison', các chỉ số này sẽ được gắn vào enemy.
        this.poisonDmg = tower.poisonDmg || 0;
        this.poisonDuration = tower.poisonDuration || 0;
        this.speed = GAME_CONFIG.GAMEPLAY.projectileSpeed;
        this.angle = Math.atan2(target.y - this.y, target.x - this.x);
    }

    static create(tower, target) {
        const p = new Projectile(tower, target);
        Game_Manager.projectiles.push(p);
    }

    /** UC: Tháp tấn công kẻ thù - [Sequence 10.1.5] Cập nhật vị trí và va chạm của viên đạn */
    update() {
        // UC10: Kiểm tra mục tiêu trước khi gây sát thương.
        // Nếu Enemy đã chết hoặc bị xóa khỏi game, Projectile không gây damage sai.
        const targetGone = !Enemy_Manager.isTargetable(this.target);

        if (targetGone) {
            this.x += Math.cos(this.angle) * (this.speed * 0.85);
            this.y += Math.sin(this.angle) * (this.speed * 0.85);

            if (this.x < 0 || this.x > GAME_CONFIG.GAMEPLAY.canvasWidth ||
                this.y < 0 || this.y > GAME_CONFIG.GAMEPLAY.canvasHeight) {
                return false;
            }

            return true;
        }

        this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // [Sequence 10.1.6] Projectile gọi takeDamage() lên đối tượng Enemy.
        if (Math.hypot(this.target.x - this.x, this.target.y - this.y) < 15) {
            if (this.attackType === 'aoe') {
                Game_Manager.explosions.push({
                    x: this.x,
                    y: this.y,
                    radius: 0,
                    maxRadius: this.expRad,
                    alpha: 1
                });

                Game_Manager.enemies.forEach(e => {
                    if (Enemy_Manager.isTargetable(e) &&
                        Math.hypot(e.x - this.x, e.y - this.y) < this.expRad) {
                        e.takeDamage(this.dmg);
                    }
                });
            } else if (this.attackType === 'magic' && Enemy_Manager.isTargetable(this.target)) {
                // [UC10 - Cải tiến] Đạn phép thuật:
                // 1. Gây sát thương trực tiếp lên enemy.
                // 2. Gắn hiệu ứng slow để làm giảm tốc độ di chuyển của enemy.
                this.target.takeDamage(this.dmg);
                this.target.effects.push({
                    type: 'slow',
                    factor: this.slowFactor,
                    duration: this.slowDuration
                });

            } else if (this.attackType === 'poison' && Enemy_Manager.isTargetable(this.target)) {
                /* ------------------------------------------------------------------
                 * [CẢI TIẾN — UC10: Tháp Độc tấn công kẻ thù]
                 * ------------------------------------------------------------------
                 * Khi Projectile của Tháp Độc chạm enemy:
                 *   1. Enemy nhận sát thương ban đầu.
                 *   2. Enemy bị gắn hiệu ứng poison.
                 *   3. Enemy tiếp tục mất máu sau mỗi tickInterval.
                 *
                 * Cơ chế này khác Tháp Phép Thuật:
                 *   - Magic: làm chậm enemy.
                 *   - Poison: rút máu enemy theo thời gian.
                 * ------------------------------------------------------------------ */
                this.target.takeDamage(this.dmg);
                this.target.effects.push({
                    type: 'poison',
                    damage: this.poisonDmg,
                    duration: this.poisonDuration,
                    tickInterval: 500,
                    tickTimer: 500
                });

            } else if (Enemy_Manager.isTargetable(this.target)) {
                this.target.takeDamage(this.dmg);
            }
            return false;
        }

        return true;
    }
}

// =====================================================================
// 2. CONTROLLER — XỬ LÝ LOGIC TRUNG TÂM
// =====================================================================

const Game_Manager = (typeof globalThis !== 'undefined' && globalThis.Game_Manager) ? globalThis.Game_Manager : {
    towers: [],
    enemies: [],
    projectiles: [],
    explosions: [],
    // Hiệu ứng trực quan khi tháp được đặt thành công. Mỗi phần tử: {x,y,radius,maxRadius,alpha}
    placementEffects: [],

    isPlaying: false,
    isGameOver: false,
    isVictory: false,
    isPaused: false,
    gameSpeed: 1,

    isSpeedUnlocked() {
        if (Player_Stats.wave > 1) return true;
        if (Player_Stats.wave === 1) {
            const waveData = GAME_CONFIG.LEVELS[currentLevel].waves[0];
            // [UC09 - 09.1.3] dùng getWaveTotalCount để hỗ trợ format groups
            const total = Wave_Manager.getWaveTotalCount(waveData);
            return Wave_Manager.enemiesSpawnedThisWave >= total
                && this.enemies.length === 0;
        }
        return false;
    },

    _rafId: null,      // ID requestAnimationFrame của render loop

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
        this.placementEffects = [];

        this.isPlaying = true;
        this.isGameOver = false;
        this.isVictory = false;
        this.isPaused = false;
        this.gameSpeed = 1;

        UI_Manager.updateUI();
        document.getElementById('speed-btn').innerText = "1x";
        UI_Manager.hideGameOver();
        UI_Manager.hideVictory();

        // [UC09] Toàn bộ state spawn đã chuyển sang Wave_Manager
        Wave_Manager.startLevel(levelId);
    },

    /** BUG FIX: Hàm dọn dẹp tập trung tất cả timers */
    _clearAllTimers() {
        // [UC09] Wave timers đã thuộc Wave_Manager
        Wave_Manager.reset();
    },

    /* ---------- Tower lifecycle ---------- */
    /**
     * [UC05 - Sequence #5.4.3] requestBuildTower(x,y,towerType)
     * Hàm điều phối chính của use case đặt tower
     * Kiểm tra vị trí hợp lệ, kiểm tra tiền
     * Sau đó tạo tower mới và cập nhật giao diện
     */
    requestBuildTower(x, y, towerType) {
        const towerConfig = GAME_CONFIG.TOWERS[towerType];

        if (!towerConfig) {
            UI_Manager.showError("Loại tháp không tồn tại", "#e74c3c");
            return false;
        }
        const positionCheck = Map_Grid.checkValidPosition(x, y);
        /**
         * [UC05 - Alternative Flow A1]
         * Nếu vị trí không hợp lệ thì hiển thị lỗi
         */
        if (!positionCheck.valid) {
            UI_Manager.showError(positionCheck.reason, "#e74c3c");
            return false;
        }
        const cost = towerConfig.levels[0].cost;
        /**
         * [UC05 - Sequence #5.4.5] checkMoney(cost)
         * Kiểm tra người chơi có đủ tiền xây tower hay không
         */
        if (!Player_Stats.checkMoney(cost)) {
            /**
             * [UC05 - Alternative Flow A2]
             * Không đủ tiền để xây tower
             */
            UI_Manager.showError("Không đủ tiền", "#f1c40f");
            return false;
        }
        const { x: spotX, y: spotY } = positionCheck.spot;
        const tower = new Tower(spotX, spotY, towerType);
        /**
         * [UC05 - Sequence #5.4.6] deductMoney(cost)
         * Trừ số vàng tương ứng giá xây tower
         */
        Player_Stats.deductMoney(cost);
        /**
         * [UC05 - Sequence #5.4.7] create Tower
         * Tạo đối tượng tower mới tại build spot hợp lệ
         */
        this.towers.push(tower);
        /**
         * [UC05 - Sequence #5.4.8] markOccupied(x,y)
         * Đánh dấu build spot đã được sử dụng
         */
        Map_Grid.markOccupied(spotX, spotY);
        /**
         * [UC05 - Sequence #5.4.9] updateUI()
         * Cập nhật lại giao diện sau khi xây tower
         */
        UI_Manager.showError(`Đã xây ${towerConfig.name}`, "#2ecc71");
        UI_Manager.updateUI();
        // Thêm hiệu ứng nhận biết: vòng "sáng lên" và lan tỏa rồi biến mất
        this.placementEffects.push({ x: spotX, y: spotY, radius: 20, alpha: 1, maxRadius: 70 });
        UI_Manager.clearSelected();

        return true;
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

    // Lớp Game_Manager - file game.js
    /**
     * [UC11 - Sequence #11.1.0] Game Loop frame update
     * Cập nhật vị trí của tất cả kẻ thù trên bản đồ
     */
    updateEnemyPosition(enemy) {
        const path = Map_Grid.getPath(enemy.pathIndex || 0);
        const target = path[enemy.node];

        if (!target) return;

        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;

        if (Math.hypot(dx, dy) < 5) {
            enemy.node++;
        } else {
            const angle = Math.atan2(dy, dx);
            enemy.x += Math.cos(angle) * enemy.speed;
            enemy.y += Math.sin(angle) * enemy.speed;
        }
    },

    /**
     * [UC11 - Sequence #11.1.1] Kiểm tra va chạm căn cứ
     * Kiểm tra tọa độ kẻ thù so với vùng an toàn của căn cứ
     */
    checkBaseCollision(enemy) {
        const path = Map_Grid.getPath(enemy.pathIndex || 0);

        if (!path || path.length === 0) return false;
        if (enemy.node >= path.length) return true;

        const base = Map_Grid.base;
        const hit = GAME_CONFIG.GAMEPLAY.baseHitRadius;

        return Math.hypot(base.x - enemy.x, base.y - enemy.y) < hit;
    },

    /**
     * [UC11 - Sequence #11.1.3] Hủy kẻ thù
     * Xóa kẻ thù khỏi mảng quản lý quái vật
     */
    destroyEnemy(enemy) {
        this.enemies = this.enemies.filter(e => e !== enemy);
    },

    /**
     * [UC11 - Sequence #11.1.4] Trừ máu căn cứ
     * Giảm HP căn cứ theo damage của kẻ thù
     */
    reduceBaseHP(damage) {
        Player_Stats.hp = Math.max(0, Player_Stats.hp - damage);
    },

    /**
     * [UC11 - Sequence #11.1.6] Kiểm tra điều kiện Game Over
     */
    checkGameOver() {
        return Player_Stats.hp <= 0;
    },

    /* =================================================================
     * [CẢI TIẾN — Nguyễn Lê Tiến Đạt | UC11 — step #7]
     * =================================================================
     * Vấn đề gốc:
     *   stopGameLoop() cũ:
     *     this.isPlaying  = false;
     *     this.isGameOver = true;
     *     this._clearAllTimers();   ← chỉ gọi Wave_Manager.reset()
     *
     *   Thiếu 3 việc quan trọng:
     *   (a) projectiles[] không được flush → đạn đang bay vẫn gọi
     *       update() trong _tickLogic() của frame kế tiếp (RAF chưa
     *       cancel kịp), có thể gây takeDamage() lên enemy của
     *       session mới sau restartLevel().
     *   (b) explosions[] không được flush → hiệu ứng nổ cũ vẫn
     *       render thêm vài frame sau Game Over.
     *   (c) _rafId không bị cancel ngay → renderLoop() vẫn schedule
     *       thêm 1 frame, gọi updateGameLoop() dù isGameOver = true
     *       (bảo vệ bằng guard clause, nhưng RAF vẫn chạy lãng phí).
     *
     * Giải pháp — cleanup theo 4 bước an toàn:
     *   Bước 1: Set flag trước — ngăn _tickLogic() chạy thêm
     *   Bước 2: _clearAllTimers() — dừng Wave spawn và waveTimeout
     *   Bước 3: Flush projectiles[] + explosions[] — xóa tài nguyên cũ
     *   Bước 4: cancelAnimationFrame(_rafId) — dừng render loop ngay
     * =================================================================*/
    /**
     * [UC11 - Sequence #11.2.1 + UC08.step#7] Dừng vòng lặp game
     * và giải phóng toàn bộ tài nguyên runtime.
     */
    stopGameLoop() {
        // Bước 1: set flag ngay để guard clause trong _tickLogic() bắt kịp
        this.isPlaying  = false;
        this.isGameOver = true;

        // Bước 2: dừng wave spawn + timeout (Wave_Manager.reset bên trong)
        this._clearAllTimers();

        // Bước 3: flush đạn và hiệu ứng nổ còn sót — tránh rò rỉ sang session mới
        this.projectiles = [];
        this.explosions  = [];

        // Bước 4: cancel RAF — render loop dừng hoàn toàn, không schedule thêm frame
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this.placementEffects = [];
    },

    /* ------------------------------------------------------------------
     * [CẢI TIẾN  — Nguyễn Lê Tiến Đạt | UC11]
     * ------------------------------------------------------------------
     * Hàm này KHÔNG còn được gọi trực tiếp từ _tickLogic().
     * Nó được kích hoạt qua enemy.onReachBase() — Enemy chủ động
     * ủy quyền, đúng vai trò "Enemy tự hủy" trong sequence diagram.
     *
     * Thứ tự step khớp sequence:
     *   destroyEnemy(enemy)             → step #3 (xóa khỏi mảng)
     *   reduceBaseHP(enemy.damage)      → step #4 (trừ máu căn cứ)
     *   updateHPDisplay + flashScreenRed → step #5 (phản hồi UI)
     *   checkGameOver()                 → step #6 (kiểm tra kết thúc)
     *   stopGameLoop() + showGameOver   → step #7 + #8 (nếu HP ≤ 0)
     * ------------------------------------------------------------------*/
    /**
     * [UC11 - Toàn bộ luồng chính + thay thế]
     * Điều phối xử lý khi enemy lọt căn cứ — được gọi qua enemy.onReachBase()
     */
    handleEnemyReachedBase(enemy) {
        // Step #3 — Xóa enemy khỏi mảng (enemy đã ủy quyền qua onReachBase)
        this.destroyEnemy(enemy);
        // Step #4 — Trừ máu căn cứ theo damage của enemy (không hardcode)
        this.reduceBaseHP(enemy.damage || 1);
        // Step #5 — Cập nhật HP trên HUD và hiệu ứng nháy đỏ màn hình
        UI_Manager.updateHPDisplay(Player_Stats.hp);
        UI_Manager.flashScreenRed();
        // Step #6 — Kiểm tra điều kiện Game Over
        if (this.checkGameOver()) {
            this.stopGameLoop();               // Step #7 (cải tiến 4: cleanup đầy đủ)
            UI_Manager.showGameOverScreen();   // Step #8
        }
    },

    /* ---------- Vòng lặp chính ---------- */

    updateGameLoop() {
        if (!this.isPlaying || this.isPaused || this.isGameOver) return;

        // Chạy logic N lần dựa trên tốc độ game (Sub-stepping)
        for (let i = 0; i < this.gameSpeed; i++) {
            this._tickLogic(16.67);
            if (this.isGameOver || this.isVictory) break;
        }
    },

    /** Cập nhật các hiệu ứng chỉ mang tính chất hiển thị (luôn chạy kể cả khi pause) */
    _updateVisualOnly(dt) {
        // Hiệu ứng đặt tháp (vòng nhòe phồng lên)
        for (let i = this.placementEffects.length - 1; i >= 0; i--) {
            const pe = this.placementEffects[i];
            pe.radius += 6;   // Phình ra nhanh
            pe.alpha -= 0.055; // Mờ dần vừa đủ nhìn thấy (~18 frame, ~0.3s)
            if (pe.alpha <= 0) this.placementEffects.splice(i, 1);
        }
    },

    _tickLogic(dt) {
        // 1. Cập nhật vị trí và va chạm Kẻ thù
        const enemiesSnapshot = this.enemies.slice();
        for (const enemy of enemiesSnapshot) {
            enemy.updateEffects(dt); 
            this.updateEnemyPosition(enemy);

            // [CẢI TIẾN  — Nguyễn Lê Tiến Đạt | UC11]
            // Cũ: handleEnemyReachedBase(enemy) — Game_Manager chủ động xử lý
            //     vi phạm ngữ nghĩa: "Enemy tự hủy" nhưng lại do Game_Manager làm
            // Mới: enemy.onReachBase() — Enemy tự kích hoạt chuỗi xử lý,
            //     ủy quyền hậu quả cho Game_Manager, đúng step #3 sequence diagram
            if (this.checkBaseCollision(enemy)) {
                enemy.onReachBase();     // Enemy chủ động → Game_Manager xử lý hậu quả
                if (this.isGameOver) return;
            }
        }

        // 2. Tháp tấn công
        this.towers.forEach(t => t.update(dt));

        // 3. Đạn di chuyển
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            if (!this.projectiles[i].update()) {
                this.projectiles.splice(i, 1);
            }
        }

        // 4. Spawn quái — [UC09] đã chuyển sang Wave_Manager
        Wave_Manager.update(dt);

        // 5. Kiểm tra quái chết
        this.checkEnemyDeath();

        // 6. Hiệu ứng nổ (hiệu ứng nhẹ)
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const ex = this.explosions[i];
            ex.radius += GAME_CONFIG.GAMEPLAY.explosionGrowthRate; 
            ex.alpha -= GAME_CONFIG.GAMEPLAY.explosionFadeRate;
            if (ex.alpha <= 0) this.explosions.splice(i, 1);
        }

        // ---- Victory check ----
        const currentWaveData = GAME_CONFIG.LEVELS[currentLevel].waves[Player_Stats.wave - 1];
        // [UC09 - 09.1.3] Hỗ trợ format groups
        const waveTotalCount = Wave_Manager.getWaveTotalCount(currentWaveData);
        if (Player_Stats.wave === Player_Stats.maxWaves &&
            currentWaveData &&
            Wave_Manager.enemiesSpawnedThisWave >= waveTotalCount &&
            this.enemies.length === 0) {
            this.isVictory = true;
            this.stopGameLoop();
            UI_Manager.showVictory();
        }
    },
    /** UC10.1 - Điều phối xử lý Enemy bị tiêu diệt */
    handleEnemyKilled(enemy) {
        if (!enemy || !this.enemies.includes(enemy)) return;

        // [Sequence 10.1.25] Enemy thông báo trạng thái bị tiêu diệt.
        const deathInfo = enemy.onDeath();

        // [Sequence 10.1.26] Game_Manager yêu cầu Enemy_Manager xóa Enemy khỏi trận đấu.
        Enemy_Manager.removeEnemy(enemy);

        // [Sequence 10.1.27] Game_Manager cộng vàng thưởng cho người chơi.
        Player_Stats.addGold((deathInfo && deathInfo.reward) || enemy.reward || 0);
    },

    /** UC10.1 - Kiểm tra Enemy còn sống hay đã bị tiêu diệt */
    checkEnemyDeath() {
        // [Sequence 10.1.23] Game_Manager kiểm tra máu của Enemy.
        const deadEnemies = this.enemies.filter(enemy => enemy.hp <= 0);

        if (deadEnemies.length > 0) {
            // [Sequence 10.1.24] Có Enemy bị tiêu diệt.
            deadEnemies.forEach(enemy => {
                this.handleEnemyKilled(enemy);
            });

            // [Sequence 10.1.28] Cập nhật giao diện sau khi xóa Enemy và cộng vàng.
            UI_Manager.updateUI();
            return;
        }

        // [Sequence 10.1.29 - 10.1.30] Enemy còn sống, UI vẫn được đồng bộ trạng thái.
        UI_Manager.updateUI();
    },

    /* ---------- Spawn waves ----------
     * [UC09] Toàn bộ logic spawn (updateSpawning / startNextWave /
     * spawnEnemy) đã được chuyển sang Wave_Manager (xem wave_manager.js).
     * Game_Manager chỉ delegate Wave_Manager.update(dt) trong _tickLogic.
     */
};

// =====================================================================
// 3. VIEW — QUẢN LÝ GIAO DIỆN VÀ TƯƠNG TÁC NGƯỜI DÙNG
// =====================================================================

const UI_Manager = (typeof globalThis !== 'undefined' && globalThis.UI_Manager) ? globalThis.UI_Manager : {
    canvas: null, ctx: null,
    selectedTowerSlot: null,
    interactTower: null,
    hoverBuildSpot: null,
    radialMenu: null, // [UC03] Lưu element Radial Menu
    activeRadialSpot: null, // [UC03] Lưu Build Spot đang mở menu
    mouseX: 0, mouseY: 0, // [UC03] Tọa độ chuột phục vụ Range Preview
    errorTimer: null,
    flashTimer: null,

    init() {
        Save_Manager.load();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = GAME_CONFIG.GAMEPLAY.canvasWidth;
        this.canvas.height = GAME_CONFIG.GAMEPLAY.canvasHeight;
        this.radialMenu = document.getElementById('radial-menu');

        this._bindMenuButtons();
        this._bindGameControls();
        this._bindTowerSlots();
        this._bindCanvasClick();
        this._bindCanvasHover();
        this._bindTowerMenu();
        this._bindGameOverModal();
        this._bindRadialMenu();

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
        document.getElementById('home-btn').onclick = () => {
            if (confirm("Dừng trận chiến và quay về màn hình chính?")) {
                this.backToMainMenu();
            }
        };
        document.getElementById('speed-btn').onclick = () => {
            const current = Game_Manager.gameSpeed;
            // Chỉ cho phép click nếu đã qua Wave 1
            if (Game_Manager.isSpeedUnlocked()) {
                Game_Manager.gameSpeed = (current === 1) ? 2 : 1;
                document.getElementById('speed-btn').innerText = Game_Manager.gameSpeed + "x";
            }
        };
        document.getElementById('restart-victory-btn').onclick = () => this.restartLevel();
        document.getElementById('next-level-btn').onclick = () => {
            const next = currentLevel + 1;
            if (GAME_CONFIG.LEVELS[next]) this.enterGame(next);
            else alert("Bạn đã hoàn thành tất cả các màn!");
        };
    },
    /**
     * [UC05 - Sequence #5.4.1] Chọn loại tháp
     * Người chơi click chọn một tower slot trên giao diện UI
     * UI_Manager lưu tower được chọn vào selectedTowerSlot
     * Đồng thời cập nhật trạng thái selected cho slot hiện tại
     */
    _bindTowerSlots() {
        document.querySelectorAll('.slot.active').forEach(slot => {
            slot.onclick = () => {
                // BUG FIX: Không cho chọn trụ khi đang pause, game over, hoặc victory
                if (Game_Manager.isPaused || Game_Manager.isGameOver || Game_Manager.isVictory) {
                    return;
                }
                const towerType = slot.dataset.type;
                const towerConfig = GAME_CONFIG.TOWERS[towerType];

                if (!towerConfig) {
                    UI_Manager.showError("Loại tháp không hợp lệ", "#e74c3c");
                    return;
                }

                const buildCost = towerConfig.levels[0].cost;

                if (!Player_Stats.checkMoney(buildCost)) {
                    UI_Manager.showError("Không đủ vàng để chọn tháp", "#f1c40f");
                    return;
                }

                this.hideTowerMenu();

                if (slot.classList.contains('selected')) {
                    this.clearSelected();
                    return;
                }

                this.clearSelected();

                slot.classList.add('selected');
                this.canvas.classList.add('build-mode');

                this.selectedTowerSlot = {
                    type: towerType,
                    cost: buildCost,
                    name: towerConfig.name
                };
            };
        });
    },
    /**
     * [UC05 - Sequence #5.4.2] Click vị trí trên bản đồ
     * Nhận sự kiện click trên canvas game
     * Lấy tọa độ clickX, clickY của người chơi
     * Nếu đã chọn tower thì gửi yêu cầu xây tower
     */
    _bindCanvasClick() {
        this.canvas.onclick = (e) => {
            // BUG FIX: Block tất cả canvas interaction khi pause, game over, hoặc victory
                if (Game_Manager.isPaused || Game_Manager.isGameOver || Game_Manager.isVictory) {
                    return;
                }

                const { clickX, clickY } = this.getCanvasPoint(e);
                const clickedTower = this.findTowerAt(clickX, clickY);

                if (clickedTower) {
                    this.clearSelected();
                    this.interactTower = clickedTower;
                    this.showTowerMenu(clickedTower);
                    return;
                }

                this.hideTowerMenu();
                this.hideRadialMenu(); // [UC03] Đóng menu cũ khi click nơi khác

                if (!this.selectedTowerSlot) {
                    const positionCheck = Map_Grid.checkValidPosition(clickX, clickY);

                    // [UC03 — Radial Menu] Nếu click vào một Build Spot trống
                    if (positionCheck.spot && positionCheck.valid) {
                        this.showRadialMenu(positionCheck.spot.x, positionCheck.spot.y, positionCheck.spot);
                        return;
                    }

                    if (positionCheck.spot) {
                        this.showError("Hãy chọn loại tháp trước", "#f1c40f");
                    }

                    return;
                }

                Game_Manager.requestBuildTower(
                    clickX,
                    clickY,
                    this.selectedTowerSlot.type
                );
            };
    },
    _bindCanvasHover() {
        this.canvas.onmousemove = (e) => {
            const { clickX, clickY } = this.getCanvasPoint(e);
            this.mouseX = clickX; // [UC03] Cập nhật tọa độ cho Range Preview
            this.mouseY = clickY;

            // Sử dụng UI_Manager thay vì this để an toàn hơn trong các môi trường test/closure phức tạp
            if (!UI_Manager.selectedTowerSlot || Game_Manager.isPaused || Game_Manager.isGameOver || Game_Manager.isVictory) {
                this.hoverBuildSpot = null;
                return;
            }

            const positionCheck = Map_Grid.checkValidPosition(clickX, clickY);

            this.hoverBuildSpot = {
                spot: positionCheck.spot,
                valid: positionCheck.valid
            };
        };

        this.canvas.onmouseleave = () => {
            this.hoverBuildSpot = null;
            this.mouseX = -1000; // [UC03] Ẩn preview khi chuột rời canvas
            this.mouseY = -1000;
        };
    },
    getCanvasPoint(e) {
        const rect = this.canvas.getBoundingClientRect();

        return {
            clickX: e.clientX - rect.left,
            clickY: e.clientY - rect.top
        };
    },

    findTowerAt(x, y) {
        const hitRadius = GAME_CONFIG.GAMEPLAY.towerHitRadius;

        return Game_Manager.towers.find(tower =>
            Math.hypot(tower.x - x, tower.y - y) <= hitRadius
        ) || null;
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
        this.hideRadialMenu(); // [UC03]

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
        this.hideRadialMenu(); // [UC03]
        document.getElementById('game-container').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
    },

    /* ---------- Tower interaction UI ---------- */

    clearSelected() {
        this.selectedTowerSlot = null;
        this.hoverBuildSpot = null;
        this.hideRadialMenu();

        document.querySelectorAll('.slot').forEach(slot =>
            slot.classList.remove('selected')
        );

        if (this.canvas) {
            this.canvas.classList.remove('build-mode');
        }
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

        // Tự động đổi hướng menu nếu tháp nằm quá sát mép trên màn hình
        if (tower.y < 180) {
            menu.style.transform = "translate(-50%, 30px)"; // Hiện phía dưới tháp
        } else {
            menu.style.transform = "translate(-50%, calc(-100% - 30px))"; // Hiện phía trên tháp
        }
    },
    hideTowerMenu() {
        document.getElementById('tower-menu').classList.add('hidden');
        this.interactTower = null;
    },

    /* ---------- [UC03] Radial Menu Handlers ---------- */

    _bindRadialMenu() {
        // Có thể bổ sung click-out để đóng menu nếu cần
    },

    showRadialMenu(x, y, spot) {
        this.activeRadialSpot = spot;
        const container = document.getElementById('radial-items-container');
        if (!container || !this.radialMenu) return; // Guard: tránh crash khi DOM chưa sẵn sàng
        container.innerHTML = ''; // Clear cũ

        // Lấy danh sách tháp có sẵn (không bị locked)
        const activeTowers = [];
        for (const [type, cfg] of Object.entries(GAME_CONFIG.TOWERS)) {
            // Check tháp đó có đang ở trạng thái locked trên UI không
            const slot = document.querySelector(`.slot[data-type="${type}"]`);
            if (slot && !slot.classList.contains('locked')) {
                activeTowers.push({ type, ...cfg });
            }
        }

        const count = activeTowers.length;
        activeTowers.forEach((tower, i) => {
            const item = document.createElement('div');
            item.className = 'radial-item';
            
            const cost = tower.levels[0].cost;
            const canAfford = Player_Stats.checkMoney(cost);
            if (!canAfford) item.classList.add('disabled');

            item.innerHTML = `
                <div class="ri-icon">${tower.levels[0].icon}</div>
                <div class="ri-cost">${cost}g</div>
            `;

            item.onclick = (e) => {
                e.stopPropagation();
                if (!canAfford) {
                    this.showError("Không đủ vàng!", "#f1c40f");
                    return;
                }
                Game_Manager.requestBuildTower(spot.x, spot.y, tower.type);
                this.hideRadialMenu();
            };

            container.appendChild(item);
        });

        this.radialMenu.style.left = x + 'px';
        this.radialMenu.style.top = y + 'px';
        this.radialMenu.classList.remove('hidden');
    },

    hideRadialMenu() {
        if (this.radialMenu) {
            this.radialMenu.classList.add('hidden');
            this.activeRadialSpot = null;
        }
    },


    /**
     * [UC11 - Sequence #11.1.5] Cập nhật hiển thị HP
     */
    updateHPDisplay(currentHP) {
        document.getElementById('hp-val').innerText = currentHP;
    },

    /**
     * [UC11 - Sequence #11.1.5] Hiệu ứng nháy đỏ màn hình
     */
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

    /**
     * [UC11 - Sequence #11.2.3 + 11.2.4] Hiển thị popup Game Over
     * với 2 nút Chơi lại và Màn hình chính
     */    showGameOverScreen() {
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
        document.querySelectorAll('.slot.active').forEach(slot => {
            const towerConfig = GAME_CONFIG.TOWERS[slot.dataset.type];

            if (!towerConfig) return;

            const buildCost = towerConfig.levels[0].cost;

            slot.querySelector('.cost').innerText = `${buildCost}g`;
            slot.classList.toggle('disabled', !Player_Stats.checkMoney(buildCost));
        });
        // Cập nhật trạng thái nút Speed (Mờ khi đang ở wave 1, Sáng ngay khi xong wave 1)
        const speedBtn = document.getElementById('speed-btn');
        if (speedBtn) {
            if (Game_Manager.isSpeedUnlocked()) {
                speedBtn.style.opacity = "1";
                speedBtn.style.cursor = "pointer";
            } else {
                speedBtn.style.opacity = "0.3";
                speedBtn.style.cursor = "not-allowed";
            }
        }
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
        // Luôn cập nhật hiệu ứng hình ảnh ở đây để đảm bảo chúng biến mất kể cả khi logic bị đứng hoặc bị patch
        Game_Manager._updateVisualOnly(16.67); 
        
        const ctx = this.ctx;
        const map = GAME_CONFIG.MAPS[Map_Grid.mapId];
        const W = this.canvas.width, H = this.canvas.height;

        ctx.clearRect(0, 0, W, H);
        if (map) {
            ctx.fillStyle = map.background;
            ctx.fillRect(0, 0, W, H);
        }

        // [Commit 16] Đường đi — vẽ TẤT CẢ paths để hỗ trợ map multi-path.
        // (Trước đây chỉ vẽ Map_Grid.path → chỉ render path[0], không hiển thị
        // các path khác. Fix lại để Map 04 vẽ đủ 2 đường.)
        const drawPath = (path) => {
            if (!path || path.length === 0) return;
            ctx.beginPath();
            path.forEach((p, i) =>
                i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke();
        };
        if (Map_Grid.paths.length > 0) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // Lớp ngoài (outer) — màu chính
            ctx.strokeStyle = map ? map.pathColor : '#e67e22';
            ctx.lineWidth = 45;
            Map_Grid.paths.forEach(drawPath);
            // Lớp trong (inner) — màu viền
            ctx.strokeStyle = map ? map.pathInnerColor : '#d35400';
            ctx.lineWidth = 35;
            Map_Grid.paths.forEach(drawPath);
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
        Map_Grid.buildSpots.forEach(spot => {
            if (Map_Grid.isSpotOccupied(spot)) return;

            const isHovered = this.hoverBuildSpot?.spot === spot;
            const isValidHover = isHovered && this.hoverBuildSpot.valid;
            const isInvalidHover = isHovered && !this.hoverBuildSpot.valid;

            ctx.save();

            ctx.fillStyle = isValidHover
                ? 'rgba(46, 204, 113, 0.35)'
                : isInvalidHover
                    ? 'rgba(231, 76, 60, 0.35)'
                    : 'rgba(255, 255, 255, 0.14)';

            ctx.strokeStyle = isValidHover ? '#2ecc71' : '#f1c40f';
            ctx.lineWidth = isHovered ? 4 : 2;
            ctx.shadowBlur = isHovered ? 18 : 8;
            ctx.shadowColor = isValidHover ? '#2ecc71' : '#f1c40f';

            ctx.beginPath();
            ctx.arc(spot.x, spot.y, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+', spot.x, spot.y);

            ctx.restore();
        });

        // Towers
        Game_Manager.towers.forEach(tower => {
            ctx.save();

            if (this.interactTower === tower) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
                ctx.beginPath();
                ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.beginPath();
            ctx.ellipse(tower.x + 3, tower.y + 9, 27, 12, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = tower.color;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.shadowBlur = this.interactTower === tower ? 20 : 8;
            ctx.shadowColor = tower.color;

            ctx.beginPath();
            ctx.arc(tower.x, tower.y, 24, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = '22px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tower.icon, tower.x, tower.y + 1);

            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(tower.x + 18, tower.y - 18, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(tower.level, tower.x + 18, tower.y - 18);

            ctx.restore();
        });

        // Hiệu ứng đặt tháp (vòng tròn hào quang bùng nổ rồi tan biến ngay)
        Game_Manager.placementEffects.forEach(pe => {
            ctx.save();
            ctx.beginPath();
            ctx.arc(pe.x, pe.y, pe.radius, 0, Math.PI * 2);
            
            // Hiệu ứng sáng trắng rực rỡ (Flash Bloom) để cực kỳ nổi bật
            ctx.globalAlpha = Math.max(0, pe.alpha);
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#ffffff';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 8;
            ctx.stroke();

            // Vòng tròn phụ mờ để tạo độ sâu cho cú flash
            ctx.beginPath();
            ctx.arc(pe.x, pe.y, pe.radius * 0.5, 0, Math.PI * 2);
            ctx.lineWidth = 4;
            ctx.globalAlpha = Math.max(0, pe.alpha * 0.5);
            ctx.stroke();
            
            ctx.restore();
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
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            
            // Vẽ viền để nổi bật trên mọi nền bản đồ
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;

            ctx.beginPath();
            const radius = p.attackType === 'aoe' ? 8 : 5;
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
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

        /* ------------------------------------------------------------------
         * [UC03 — Đặt tháp phòng thủ | Range Preview]
         * Hiển thị tầm bắn và tháp mờ (ghost tower) trước khi xây dựng.
         * ------------------------------------------------------------------ */
        if (this.selectedTowerSlot && this.mouseX > 0) {
            const type = this.selectedTowerSlot.type;
            const range = GAME_CONFIG.TOWERS[type].levels[0].range;
            const color = GAME_CONFIG.TOWERS[type].color;
            
            // Tạm dùng logic snap nếu có Build Spot gần đó
            const drawX = this.hoverBuildSpot?.spot ? this.hoverBuildSpot.spot.x : this.mouseX;
            const drawY = this.hoverBuildSpot?.spot ? this.hoverBuildSpot.spot.y : this.mouseY;
            const isValid = this.hoverBuildSpot?.valid;

            ctx.save();
            // 1. Vẽ vòng tròn tầm bắn
            ctx.beginPath();
            ctx.arc(drawX, drawY, range, 0, Math.PI * 2);
            ctx.fillStyle = isValid ? 'rgba(255, 255, 255, 0.15)' : 'rgba(231, 76, 60, 0.2)';
            ctx.fill();
            ctx.setLineDash([5, 5]); // Nét đứt cho chuyên nghiệp
            ctx.strokeStyle = isValid ? 'rgba(255, 255, 255, 0.5)' : '#e74c3c';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 2. Vẽ "Ghost Tower" - Hình ảnh mờ của tháp
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(drawX, drawY, 25, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#fff"; ctx.stroke();
            const icon = GAME_CONFIG.TOWERS[type].levels[0].icon;
            ctx.globalAlpha = 0.8;
            ctx.font = '22px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(icon, drawX, drawY + 1);
            ctx.restore();
        }

        Game_Manager._rafId = requestAnimationFrame(() => this.renderLoop());
    }
};

window.onload = () => UI_Manager.init();