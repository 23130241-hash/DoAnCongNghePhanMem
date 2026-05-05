// =====================================================================
// ⚙️ TỪ ĐIỂN CẤU HÌNH TRÒ CHƠI (CENTRALIZED CONFIGURATION)
// Thay đổi độ khó, chỉ số, thời gian... tất cả ở đây mà không cần sửa code logic
// =====================================================================
const GAME_CONFIG = {
    // 1. Cấu hình Màn chơi (Level)
    LEVEL: {
        startMoney: 300,        // Số vàng ban đầu
        startHP: 20,            // Số máu (HP) căn cứ ban đầu
        maxWaves: 3,            // Tổng số đợt quái (Wave)
        firstWaveDelay: 3000,   // Thời gian chờ trước khi bắt đầu Wave 1 (Tính bằng mili-giây: 3000ms = 3s)
        waveDelay: 25000,       // Thời gian nghỉ giữa các Wave (15s)
        enemiesPerWave: 10,     // Số lượng quái sinh ra trong 1 Wave
        spawnInterval: 800     // Khoảng cách thời gian sinh ra giữa 2 con quái (1s)
    },
    // 2. Cấu hình Kẻ thù (Enemies)
    ENEMY: {
        baseHp: 25,             // Máu cơ bản của quái ở Wave 1
        hpScalePerWave: 20,     // Số máu cộng thêm cho quái mỗi khi sang Wave mới
        speed: 1.2,             // Tốc độ di chuyển cơ bản
        reward: 15,             // Tiền thưởng khi tiêu diệt 1 con quái
        size: 15                // Bán kính/Kích thước vẽ quái trên bản đồ
    },
    // 3. Cấu hình Hệ thống Trụ (Towers)
    TOWERS: {
        sellRatio: 0.5,         // Tỷ lệ hoàn tiền khi bán trụ (0.5 = 50%)
        archer: {
            cost: 50,           // Giá mua
            range: 200,         // Tầm đánh (Bán kính)
            dmg: 10,            // Sát thương mỗi phát bắn
            cd: 800,            // Thời gian hồi chiêu (Cooldown) tính bằng mili-giây
            color: '#3498db',   // Màu sắc hiển thị
            icon: '🏹',         // Icon hiển thị
            type: 'single'      // Loại sát thương: Đơn mục tiêu
        },
        cannon: {
            cost: 100,
            range: 100,
            dmg: 25,
            cd: 1500,
            color: '#e74c3c',
            icon: '💣',
            type: 'aoe',        // Loại sát thương: Diện rộng (Area of Effect)
            explosionRadius: 100 // Bán kính nổ (Chỉ dành riêng cho pháo)
        }
    }
};

// =====================================================================
// 1. MODEL - QUẢN LÝ DỮ LIỆU
// =====================================================================

/**
 * Object Player_Stats: Quản lý các chỉ số sinh tồn của người chơi
 */
const Player_Stats = {
    hp: GAME_CONFIG.LEVEL.startHP,
    maxHp: GAME_CONFIG.LEVEL.startHP,
    money: GAME_CONFIG.LEVEL.startMoney,
    wave: 0,
    maxWaves: GAME_CONFIG.LEVEL.maxWaves,

    checkMoney(cost) { return this.money >= cost; },
    deductMoney(cost) { this.money -= cost; }
};

/**
 * Object Map_Grid: Quản lý lưới tọa độ, đường đi của quái và vị trí xây dựng
 */
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

/**
 * Class Tower: Khuôn mẫu để tạo ra các Trụ phòng thủ
 */
class Tower {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.lastShot = 0; // Lưu thời điểm bắn cuối cùng để tính Cooldown

        // Tự động nạp chỉ số từ GAME_CONFIG dựa vào loại tháp (type)
        const stats = GAME_CONFIG.TOWERS[type];
        this.cost = stats.cost;
        this.range = stats.range;
        this.dmg = stats.dmg;
        this.cd = stats.cd;
        this.color = stats.color;
        this.icon = stats.icon;
        this.attackType = stats.type;
        this.explosionRadius = stats.explosionRadius || 0;
    }
}

// =====================================================================
// 2. CONTROLLER - XỬ LÝ LOGIC TRUNG TÂM
// =====================================================================

const Game_Manager = {
    towers: [], enemies: [], projectiles: [], explosions: [],
    isPlaying: false, isGameOver: false, isPaused: false, enemiesSpawnedThisWave: 0,

    /**
     * Xử lý luồng: Người chơi yêu cầu xây tháp
     */
    requestBuildTower(x, y, towerType, cost) {
        let positionCheck = Map_Grid.checkValidPosition(x, y);
        if (positionCheck.valid) {
            if (Player_Stats.checkMoney(cost)) {
                Player_Stats.deductMoney(cost);
                let newTower = new Tower(positionCheck.spot.x, positionCheck.spot.y, towerType);
                this.towers.push(newTower);
                Map_Grid.markOccupied(positionCheck.spot.x, positionCheck.spot.y);
                UI_Manager.updateUI();
                UI_Manager.clearSelected();
            } else { UI_Manager.showError("Không đủ tiền", "#f1c40f"); }
        } else { UI_Manager.showError("Vị trí không hợp lệ", "#e74c3c"); }
    },

    /**
     * Xử lý luồng: Bán tháp đã xây
     */
    sellTower(tower) {
        // Hoàn tiền theo tỷ lệ cấu hình
        Player_Stats.money += tower.cost * GAME_CONFIG.TOWERS.sellRatio;
        Map_Grid.freeSpot(tower.x, tower.y);
        this.towers = this.towers.filter(t => t !== tower);
        UI_Manager.updateUI();
    },

    /**
     * Hàm Loop chính: Cập nhật vị trí quái, trụ bắn, đạn bay (Chạy liên tục 60fps)
     */
    updateGameLoop() {
        if (!this.isPlaying || this.isPaused || this.isGameOver) return;

        // 1. Cập nhật di chuyển của Quái vật
        this.enemies.forEach((e, i) => {
            let target = Map_Grid.path[e.node];
            if(Math.hypot(target.x - e.x, target.y - e.y) < 5) {
                e.node++;
                // Quái lọt vào căn cứ
                if(e.node >= Map_Grid.path.length) {
                    Player_Stats.hp--;
                    UI_Manager.updateUI();
                    this.enemies.splice(i, 1);
                    if(Player_Stats.hp <= 0) {
                        this.isGameOver = true;
                        setTimeout(() => { alert("THUA CUỘC!"); window.location.reload(); }, 100);
                    }
                    return;
                }
            }
            let angle = Math.atan2(target.y - e.y, target.x - e.x);
            e.x += Math.cos(angle) * e.speed;
            e.y += Math.sin(angle) * e.speed;
        });

        // 2. Logic Trụ tìm mục tiêu và bắn
        let now = Date.now();
        this.towers.forEach(t => {
            // Kiểm tra Cooldown
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

        // 3. Logic Đạn bay và Gây sát thương
        this.projectiles.forEach((p, i) => {
            // Quái chết trước khi đạn tới -> Đạn bay thẳng ra ngoài map rồi biến mất
            if(!p.target || p.target.hp <= 0 && this.enemies.indexOf(p.target) === -1) {
                p.x += Math.cos(p.angle || 0) * 10; p.y += Math.sin(p.angle || 0) * 10;
                if(p.x < 0 || p.x > 900 || p.y < 0 || p.y > 600) this.projectiles.splice(i, 1);
                return;
            }

            p.angle = Math.atan2(p.target.y - p.y, p.target.x - p.x);
            // Nếu đạn chạm mục tiêu
            if(Math.hypot(p.target.x - p.x, p.target.y - p.y) < 15) {

                // Hiệu ứng và sát thương của Pháo (AOE)
                if(p.attackType === 'aoe') {
                    this.explosions.push({x: p.x, y: p.y, radius: 0, maxRadius: p.expRad, alpha: 1});
                    // Sát thương văng trúng tất cả quái trong bán kính nổ
                    this.enemies.forEach(e => {
                        if(Math.hypot(e.x - p.x, e.y - p.y) < p.expRad) e.hp -= p.dmg;
                    });
                } else {
                    // Sát thương của Cung (Single)
                    p.target.hp -= p.dmg;
                }

                this.checkEnemyDeath();
                this.projectiles.splice(i, 1);
            } else {
                p.x += Math.cos(p.angle) * 12; p.y += Math.sin(p.angle) * 12;
            }
        });

        // 4. Cập nhật hoạt ảnh nổ
        this.explosions.forEach((ex, i) => {
            ex.radius += 3; ex.alpha -= 0.05;
            if(ex.alpha <= 0) this.explosions.splice(i, 1);
        });

        // 5. Kiểm tra điều kiện Chiến thắng
        if (Player_Stats.wave === GAME_CONFIG.LEVEL.maxWaves &&
            this.enemiesSpawnedThisWave >= GAME_CONFIG.LEVEL.enemiesPerWave &&
            this.enemies.length === 0) {
            this.isGameOver = true;
            UI_Manager.showVictory();
        }
    },

    /**
     * Dọn dẹp xác quái và cộng tiền
     */
    checkEnemyDeath() {
        this.enemies = this.enemies.filter(e => {
            if(e.hp <= 0) {
                Player_Stats.money += GAME_CONFIG.ENEMY.reward;
                UI_Manager.updateUI();
                return false;
            }
            return true;
        });
    },

    /**
     * Khởi động quá trình sinh quái theo Wave
     */
    spawnWave() {
        if(this.isGameOver || Player_Stats.wave >= GAME_CONFIG.LEVEL.maxWaves) return;

        Player_Stats.wave++;
        UI_Manager.updateUI();
        this.enemiesSpawnedThisWave = 0;

        // Tính toán Máu quái dựa trên Wave hiện tại (Lũy tiến độ khó)
        let currentWaveHp = GAME_CONFIG.ENEMY.baseHp + (Player_Stats.wave * GAME_CONFIG.ENEMY.hpScalePerWave);

        let spawnInterval = setInterval(() => {
            if(this.isPaused) return;

            this.enemies.push({
                x: Map_Grid.path[0].x, y: Map_Grid.path[0].y,
                hp: currentWaveHp, maxHp: currentWaveHp,
                speed: GAME_CONFIG.ENEMY.speed, node: 1
            });
            this.enemiesSpawnedThisWave++;

            // Dừng sinh quái khi đủ số lượng của Wave
            if(this.enemiesSpawnedThisWave >= GAME_CONFIG.LEVEL.enemiesPerWave) {
                clearInterval(spawnInterval);
                // Lên lịch cho Wave tiếp theo
                if(Player_Stats.wave < GAME_CONFIG.LEVEL.maxWaves) {
                    setTimeout(() => this.spawnWave(), GAME_CONFIG.LEVEL.waveDelay);
                }
            }
        }, GAME_CONFIG.LEVEL.spawnInterval);
    }
};

// =====================================================================
// 3. VIEW - QUẢN LÝ GIAO DIỆN VÀ TƯƠNG TÁC NGƯỜI DÙNG
// =====================================================================
const UI_Manager = {
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    selectedTowerSlot: null,
    interactTower: null,

    init() {
        this.canvas.width = 900; this.canvas.height = 600;

        document.getElementById('start-btn').onclick = () => {
            document.getElementById('main-menu').classList.add('hidden');
            document.getElementById('game-container').classList.remove('hidden');
            Game_Manager.isPlaying = true;

            // Gọi Wave 1 sau một khoảng delay đầu game
            setTimeout(() => Game_Manager.spawnWave(), GAME_CONFIG.LEVEL.firstWaveDelay);
            this.renderLoop();
        };

        // Pause & Retry
        document.getElementById('pause-btn').onclick = () => {
            Game_Manager.isPaused = !Game_Manager.isPaused;
            document.getElementById('pause-btn').innerText = Game_Manager.isPaused ? "▶️" : "⏸️";
        };
        document.getElementById('retry-btn').onclick = () => window.location.reload();
        document.getElementById('restart-victory-btn').onclick = () => window.location.reload();
        document.getElementById('next-level-btn').onclick = () => alert("Level 2 sẽ được cập nhật sau!");

        // Lắng nghe thao tác chọn tháp
        document.querySelectorAll('.slot.active').forEach(slot => {
            slot.onclick = () => {
                this.hideTowerMenu();
                if (slot.classList.contains('selected')) {
                    this.clearSelected();
                } else {
                    this.clearSelected();
                    slot.classList.add('selected');
                    this.selectedTowerSlot = { type: slot.dataset.type, cost: parseInt(slot.dataset.cost) };
                }
            };
        });

        // Tương tác Canvas (Xây tháp / Chọn tháp)
        this.canvas.onclick = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            let clickedTower = Game_Manager.towers.find(t => Math.hypot(t.x - clickX, t.y - clickY) < 25);
            if (clickedTower) {
                this.clearSelected();
                this.interactTower = clickedTower;
                this.showTowerMenu(clickedTower.x, clickedTower.y, clickedTower.cost);
                return;
            }

            this.hideTowerMenu();

            if (this.selectedTowerSlot) {
                Game_Manager.requestBuildTower(clickX, clickY, this.selectedTowerSlot.type, this.selectedTowerSlot.cost);
            }
        };

        // Nút trong Menu Tháp
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
        // Tính giá bán hiển thị trên nút dựa vào tỷ lệ cấu hình
        document.getElementById('sell-price').innerText = Math.floor(cost * GAME_CONFIG.TOWERS.sellRatio);
        menu.classList.remove('hidden');
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
    },

    hideTowerMenu() {
        document.getElementById('tower-menu').classList.add('hidden');
        this.interactTower = null;
    },

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
        msgDiv.innerText = `⚠️ ${msg}`; msgDiv.style.color = color;
        msgDiv.style.opacity = 1;
        clearTimeout(this.errorTimer);
        this.errorTimer = setTimeout(() => msgDiv.style.opacity = 0, 1500);
    },

    /**
     * Vòng lặp Render đồ họa lên Canvas
     */
    renderLoop() {
        Game_Manager.updateGameLoop();
        let ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Vẽ đường đi
        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 45; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); Map_Grid.path.forEach((p, i) => i===0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
        ctx.strokeStyle = '#d35400'; ctx.lineWidth = 35; ctx.stroke();

        // Vẽ Căn cứ
        ctx.fillStyle = '#2980b9'; ctx.beginPath(); ctx.arc(900, 450, 60, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '30px Arial'; ctx.fillText('🏰', 870, 460);

        // Vẽ ô xây dựng
        Map_Grid.buildSpots.forEach(s => {
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(s.x-25, s.y-25, 50, 50);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth=2; ctx.strokeRect(s.x-25, s.y-25, 50, 50);
        });

        // Vẽ Trụ (Tower)
        Game_Manager.towers.forEach(t => {
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(t.x+2, t.y+5, 25, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x, t.y, 25, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth=3; ctx.stroke();
            ctx.font = '22px Arial'; ctx.fillText(t.icon, t.x-11, t.y+8);

            // Hiển thị tầm bắn
            if(this.interactTower === t) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth=1; ctx.stroke();
            }
        });

        // Vẽ Quái (Enemies)
        Game_Manager.enemies.forEach(e => {
            ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(e.x, e.y, GAME_CONFIG.ENEMY.size, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(e.x-6, e.y-4, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.x+6, e.y-4, 3, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillRect(e.x-15, e.y-25, 30, 6);
            ctx.fillStyle = '#2ecc71'; ctx.fillRect(e.x-15, e.y-25, 30 * (e.hp/e.maxHp), 6);
        });

        // Vẽ Đạn
        Game_Manager.projectiles.forEach(p => {
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.attackType==='aoe'?8:5, 0, Math.PI*2); ctx.fill();
        });

        // Vẽ Hiệu ứng Nổ
        Game_Manager.explosions.forEach(ex => {
            ctx.fillStyle = `rgba(231, 76, 60, ${ex.alpha})`;
            ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = `rgba(241, 196, 15, ${ex.alpha})`;
            ctx.lineWidth = 2; ctx.stroke();
        });

        // Vẽ màn hình PAUSE
        if (Game_Manager.isPaused) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0,0,900,600);
            ctx.fillStyle = '#fff'; ctx.font = '50px Arial'; ctx.fillText('ĐÃ TẠM DỪNG', 270, 300);
        }

        requestAnimationFrame(() => this.renderLoop());
    }
};

window.onload = () => UI_Manager.init();