// Biến toàn cục quản lý màn chơi hiện tại (Mặc định là 1)
let currentLevel = 1;

// =====================================================================
// ⚙️ TỪ ĐIỂN CẤU HÌNH TRÒ CHƠI (Đã bổ sung màu sắc và tỷ lệ bán tháp)
// =====================================================================
const GAME_CONFIG = {
    SAVE_DATA: { totalStars: 0, unlockedUpgrades: [], completedLevels: {} },

    LEVELS: {
        1: {
            name: "Cửa ngõ vương quốc",
            startMoney: 300, startHP: 20,
            waves: [
                { enemyType: 'creep', count: 10, interval: 1000 },
                { enemyType: 'fast_creep', count: 15, interval: 800 }
            ]
        }
    },

    ENEMIES: {
        creep: { name: "Creep", hp: 40, speed: 1.2, reward: 15, size: 16, icon: '👾' },
        fast_creep: { name: "Scout", hp: 25, speed: 2.0, reward: 20, size: 14, icon: '🏃' }
    },

    UPGRADE_TREE: { /* Giữ nguyên cho sau này */ },

    TOWERS: {
        sellRatio: 0.5,
        archer: {
            color: '#3498db', type: 'single',
            levels: [
                { lvl: 1, cost: 50, range: 150, dmg: 10, cd: 800, icon: '🏹' },
                { lvl: 2, cost: 70, range: 170, dmg: 15, cd: 750, icon: '🏹⭐' }
            ]
        },
        cannon: {
            color: '#e74c3c', type: 'aoe',
            levels: [
                { lvl: 1, cost: 100, range: 100, dmg: 25, cd: 1500, explosionRadius: 50, icon: '💣' }
            ]
        }
    }
};

const Save_Manager = {
    key: "KINGDOM_DEFENSE_DATA",
    save() { localStorage.setItem(this.key, JSON.stringify(GAME_CONFIG.SAVE_DATA)); },
    load() { /* Sẽ hoàn thiện ở bước giao diện chiến dịch */ },
    addStars(levelId, stars) { /* Sẽ hoàn thiện ở bước xử lý qua màn */ }
};

// =====================================================================
// 1. MODEL - QUẢN LÝ DỮ LIỆU (Đã cập nhật để đọc từ LEVELS)
// =====================================================================

const Player_Stats = {
    hp: GAME_CONFIG.LEVELS[currentLevel].startHP,
    maxHp: GAME_CONFIG.LEVELS[currentLevel].startHP,
    money: GAME_CONFIG.LEVELS[currentLevel].startMoney,
    wave: 0,
    maxWaves: GAME_CONFIG.LEVELS[currentLevel].waves.length,
    checkMoney(cost) { return this.money >= cost; },
    deductMoney(cost) { this.money -= cost; }
};

const Map_Grid = {
    buildSpots: [{x: 180, y: 220}, {x: 400, y: 120}, {x: 620, y: 220}, {x: 400, y: 380}, {x: 750, y: 350}],
    occupiedSpots: [],
    path: [{x: -50, y: 300}, {x: 250, y: 300}, {x: 250, y: 180}, {x: 550, y: 180}, {x: 550, y: 450}, {x: 950, y: 450}],
    checkValidPosition(x, y) {
        const spot = this.buildSpots.find(s => Math.hypot(s.x - x, s.y - y) < 35);
        if (!spot) return { valid: false, spot: null };
        const isOccupied = this.occupiedSpots.some(s => s.x === spot.x && s.y === spot.y);
        return { valid: !isOccupied, spot: spot };
    },
    markOccupied(x, y) { this.occupiedSpots.push({x, y}); },
    freeSpot(x, y) { this.occupiedSpots = this.occupiedSpots.filter(s => s.x !== x || s.y !== y); }
};

class Tower {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type; this.lastShot = 0;

        // Đã cập nhật để đọc chỉ số Level 1 của tháp
        const base = GAME_CONFIG.TOWERS[type];
        const stats = base.levels[0];

        this.cost = stats.cost; this.range = stats.range;
        this.dmg = stats.dmg; this.cd = stats.cd;
        this.color = base.color; this.icon = stats.icon;
        this.attackType = base.type;
        this.explosionRadius = stats.explosionRadius || 0;
    }
}

// =====================================================================
// 2. CONTROLLER - XỬ LÝ LOGIC TRUNG TÂM
// =====================================================================

const Game_Manager = {
    towers: [], enemies: [], projectiles: [], explosions: [],
    isPlaying: false, isGameOver: false, isPaused: false, enemiesSpawnedThisWave: 0,

    requestBuildTower(x, y, towerType, cost) {
        let positionCheck = Map_Grid.checkValidPosition(x, y);
        if (positionCheck.valid) {
            if (Player_Stats.checkMoney(cost)) {
                Player_Stats.deductMoney(cost);
                this.towers.push(new Tower(positionCheck.spot.x, positionCheck.spot.y, towerType));
                Map_Grid.markOccupied(positionCheck.spot.x, positionCheck.spot.y);
                UI_Manager.updateUI(); UI_Manager.clearSelected();
            } else { UI_Manager.showError("Không đủ tiền", "#f1c40f"); }
        } else { UI_Manager.showError("Vị trí không hợp lệ", "#e74c3c"); }
    },

    sellTower(tower) {
        Player_Stats.money += tower.cost * GAME_CONFIG.TOWERS.sellRatio;
        Map_Grid.freeSpot(tower.x, tower.y);
        this.towers = this.towers.filter(t => t !== tower);
        UI_Manager.updateUI();
    },

    updateGameLoop() {
        if (!this.isPlaying || this.isPaused || this.isGameOver) return;

        this.enemies.forEach((e, i) => {
            let target = Map_Grid.path[e.node];
            if(Math.hypot(target.x - e.x, target.y - e.y) < 5) {
                e.node++;
                if(e.node >= Map_Grid.path.length) {
                    Player_Stats.hp--; UI_Manager.updateUI(); this.enemies.splice(i, 1);
                    if(Player_Stats.hp <= 0) {
                        this.isGameOver = true;
                        setTimeout(() => { alert("THUA CUỘC!"); window.location.reload(); }, 100);
                    }
                    return;
                }
            }
            let angle = Math.atan2(target.y - e.y, target.x - e.x);
            e.x += Math.cos(angle) * e.speed; e.y += Math.sin(angle) * e.speed;
        });

        let now = Date.now();
        this.towers.forEach(t => {
            if(now - t.lastShot > t.cd) {
                let target = this.enemies.find(e => Math.hypot(e.x-t.x, e.y-t.y) <= t.range);
                if(target) {
                    this.projectiles.push({
                        x: t.x, y: t.y, target: target, dmg: t.dmg,
                        color: t.color, attackType: t.attackType, expRad: t.explosionRadius
                    });
                    t.lastShot = now;
                }
            }
        });

        this.projectiles.forEach((p, i) => {
            if(!p.target || p.target.hp <= 0 && this.enemies.indexOf(p.target) === -1) {
                p.x += Math.cos(p.angle || 0) * 10; p.y += Math.sin(p.angle || 0) * 10;
                if(p.x < 0 || p.x > 900 || p.y < 0 || p.y > 600) this.projectiles.splice(i, 1);
                return;
            }
            p.angle = Math.atan2(p.target.y - p.y, p.target.x - p.x);
            if(Math.hypot(p.target.x - p.x, p.target.y - p.y) < 15) {
                if(p.attackType === 'aoe') {
                    this.explosions.push({x: p.x, y: p.y, radius: 0, maxRadius: p.expRad, alpha: 1});
                    this.enemies.forEach(e => { if(Math.hypot(e.x - p.x, e.y - p.y) < p.expRad) e.hp -= p.dmg; });
                } else { p.target.hp -= p.dmg; }
                this.checkEnemyDeath(); this.projectiles.splice(i, 1);
            } else { p.x += Math.cos(p.angle) * 12; p.y += Math.sin(p.angle) * 12; }
        });

        this.explosions.forEach((ex, i) => {
            ex.radius += 3; ex.alpha -= 0.05;
            if(ex.alpha <= 0) this.explosions.splice(i, 1);
        });

        let currentWaveData = GAME_CONFIG.LEVELS[currentLevel].waves[Player_Stats.wave - 1];
        if (Player_Stats.wave === Player_Stats.maxWaves &&
            currentWaveData && this.enemiesSpawnedThisWave >= currentWaveData.count &&
            this.enemies.length === 0) {
            this.isGameOver = true; UI_Manager.showVictory();
        }
    },

    checkEnemyDeath() {
        this.enemies = this.enemies.filter(e => {
            if(e.hp <= 0) {
                Player_Stats.money += e.reward; // Đọc tiền thưởng từ thuộc tính con quái
                UI_Manager.updateUI(); return false;
            }
            return true;
        });
    },

    // Đã cập nhật lại hệ thống sinh quái để đọc từ mảng Waves
    spawnWave() {
        if(this.isGameOver || Player_Stats.wave >= Player_Stats.maxWaves) return;

        let waveData = GAME_CONFIG.LEVELS[currentLevel].waves[Player_Stats.wave];
        let enemyStats = GAME_CONFIG.ENEMIES[waveData.enemyType];

        Player_Stats.wave++; UI_Manager.updateUI();
        this.enemiesSpawnedThisWave = 0;

        let spawnInterval = setInterval(() => {
            if(this.isPaused) return;

            // Truyền thông số từ dictionary ENEMIES vào từng con quái
            this.enemies.push({
                x: Map_Grid.path[0].x, y: Map_Grid.path[0].y,
                hp: enemyStats.hp, maxHp: enemyStats.hp,
                speed: enemyStats.speed, node: 1,
                size: enemyStats.size, reward: enemyStats.reward
            });
            this.enemiesSpawnedThisWave++;

            if(this.enemiesSpawnedThisWave >= waveData.count) {
                clearInterval(spawnInterval);
                if(Player_Stats.wave < Player_Stats.maxWaves) {
                    setTimeout(() => this.spawnWave(), 10000); // Tạm fix 10s nghỉ giữa các wave
                }
            }
        }, waveData.interval);
    }
};

// =====================================================================
// 3. VIEW - QUẢN LÝ GIAO DIỆN VÀ TƯƠNG TÁC NGƯỜI DÙNG
// =====================================================================
const UI_Manager = {
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    selectedTowerSlot: null, interactTower: null,

    init() {
        this.canvas.width = 900; this.canvas.height = 600;

        // Bắt đầu từ Menu chính nhảy thẳng vào game (Sau này ta sẽ chèn map Chiến dịch vào giữa)
        document.getElementById('start-btn').onclick = () => {
            document.getElementById('main-menu').classList.add('hidden');
            document.getElementById('game-container').classList.remove('hidden');
            Game_Manager.isPlaying = true;
            setTimeout(() => Game_Manager.spawnWave(), 2000);
            this.renderLoop();
        };

        document.getElementById('pause-btn').onclick = () => {
            Game_Manager.isPaused = !Game_Manager.isPaused;
            document.getElementById('pause-btn').innerText = Game_Manager.isPaused ? "▶️" : "⏸️";
        };
        document.getElementById('retry-btn').onclick = () => window.location.reload();
        document.getElementById('restart-victory-btn').onclick = () => window.location.reload();
        document.getElementById('next-level-btn').onclick = () => alert("Level 2 đang phát triển!");

        document.querySelectorAll('.slot.active').forEach(slot => {
            slot.onclick = () => {
                this.hideTowerMenu();
                if (slot.classList.contains('selected')) { this.clearSelected(); }
                else {
                    this.clearSelected(); slot.classList.add('selected');
                    this.selectedTowerSlot = { type: slot.dataset.type, cost: parseInt(slot.dataset.cost) };
                }
            };
        });

        this.canvas.onclick = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left; const clickY = e.clientY - rect.top;

            let clickedTower = Game_Manager.towers.find(t => Math.hypot(t.x - clickX, t.y - clickY) < 25);
            if (clickedTower) {
                this.clearSelected(); this.interactTower = clickedTower;
                this.showTowerMenu(clickedTower.x, clickedTower.y, clickedTower.cost); return;
            }
            this.hideTowerMenu();
            if (this.selectedTowerSlot) {
                Game_Manager.requestBuildTower(clickX, clickY, this.selectedTowerSlot.type, this.selectedTowerSlot.cost);
            }
        };

        document.getElementById('close-menu-btn').onclick = () => this.hideTowerMenu();
        document.getElementById('sell-btn').onclick = () => {
            if(this.interactTower) Game_Manager.sellTower(this.interactTower);
            this.hideTowerMenu();
        };

        this.updateUI();
    },

    clearSelected() {
        this.selectedTowerSlot = null;
        document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
    },
    showTowerMenu(x, y, cost) {
        const menu = document.getElementById('tower-menu');
        document.getElementById('sell-price').innerText = Math.floor(cost * GAME_CONFIG.TOWERS.sellRatio);
        menu.classList.remove('hidden'); menu.style.left = x + 'px'; menu.style.top = y + 'px';
    },
    hideTowerMenu() { document.getElementById('tower-menu').classList.add('hidden'); this.interactTower = null; },

    showVictory() {
        document.getElementById('victory-modal').classList.remove('hidden');
        document.getElementById('final-hp').innerText = Player_Stats.hp;
        let stars = "⭐";
        if(Player_Stats.hp >= 10) stars = "⭐⭐";
        if(Player_Stats.hp >= 15) stars = "⭐⭐⭐";
        document.getElementById('stars-display').innerText = stars;
    },

    updateUI() {
        document.getElementById('hp-val').innerText = Player_Stats.hp;
        document.getElementById('gold-val').innerText = Player_Stats.money;
        document.getElementById('wave-val').innerText = `${Player_Stats.wave}/${Player_Stats.maxWaves}`;
    },

    showError(msg, color) {
        const msgDiv = document.getElementById('ui-messages');
        msgDiv.innerText = `⚠️ ${msg}`; msgDiv.style.color = color; msgDiv.style.opacity = 1;
        clearTimeout(this.errorTimer); this.errorTimer = setTimeout(() => msgDiv.style.opacity = 0, 1500);
    },

    renderLoop() {
        Game_Manager.updateGameLoop();
        let ctx = this.ctx; ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 45; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); Map_Grid.path.forEach((p, i) => i===0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
        ctx.strokeStyle = '#d35400'; ctx.lineWidth = 35; ctx.stroke();

        ctx.fillStyle = '#2980b9'; ctx.beginPath(); ctx.arc(900, 450, 60, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '30px Arial'; ctx.fillText('🏰', 870, 460);

        Map_Grid.buildSpots.forEach(s => {
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(s.x-25, s.y-25, 50, 50);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth=2; ctx.strokeRect(s.x-25, s.y-25, 50, 50);
        });

        Game_Manager.towers.forEach(t => {
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(t.x+2, t.y+5, 25, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x, t.y, 25, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth=3; ctx.stroke();
            ctx.font = '22px Arial'; ctx.fillText(t.icon, t.x-11, t.y+8);

            if(this.interactTower === t) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth=1; ctx.stroke();
            }
        });

        Game_Manager.enemies.forEach(e => {
            // Cập nhật lấy kích thước riêng của từng con quái (e.size)
            ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(e.x-6, e.y-4, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.x+6, e.y-4, 3, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillRect(e.x-15, e.y-25, 30, 6);
            ctx.fillStyle = '#2ecc71'; ctx.fillRect(e.x-15, e.y-25, 30 * (e.hp/e.maxHp), 6);
        });

        Game_Manager.projectiles.forEach(p => {
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.attackType==='aoe'?8:5, 0, Math.PI*2); ctx.fill();
        });

        Game_Manager.explosions.forEach(ex => {
            ctx.fillStyle = `rgba(231, 76, 60, ${ex.alpha})`;
            ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = `rgba(241, 196, 15, ${ex.alpha})`; ctx.lineWidth = 2; ctx.stroke();
        });

        if (Game_Manager.isPaused) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0,0,900,600);
            ctx.fillStyle = '#fff'; ctx.font = '50px Arial'; ctx.fillText('ĐÃ TẠM DỪNG', 270, 300);
        }

        requestAnimationFrame(() => this.renderLoop());
    }
};

window.onload = () => UI_Manager.init();