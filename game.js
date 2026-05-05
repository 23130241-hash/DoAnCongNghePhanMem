// ==================== 1. MODEL ====================
const state = {
  hp: 20, maxHp: 20, gold: 200, wave: 0, maxWaves: 3,
  enemies: [], towers: [], projectiles: [],
  timer: 20, isPlaying: false,
  selectedTower: null,
  path: [{x: 0, y: 300}, {x: 200, y: 300}, {x: 200, y: 150}, {x: 600, y: 150}, {x: 600, y: 450}, {x: 800, y: 450}],
  buildSpots: [{x: 100, y: 240}, {x: 300, y: 100}, {x: 500, y: 200}, {x: 650, y: 400}]
};

const TOWER_TYPES = {
  archer: { cost: 50, range: 120, dmg: 5, color: '#3498db', type: 'single' },
  cannon: { cost: 100, range: 100, dmg: 10, color: '#e74c3c', type: 'aoe' }
};

// ==================== 2. VIEW ====================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Vẽ cỏ & đường đi
  ctx.fillStyle = '#2ecc71'; ctx.fillRect(0, 0, 800, 600);
  ctx.strokeStyle = '#95a5a6'; ctx.lineWidth = 40; ctx.beginPath();
  state.path.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Vẽ đích (Lá cờ & kết giới)
  ctx.fillStyle = 'rgba(52, 152, 219, 0.3)'; ctx.beginPath();
  ctx.arc(800, 450, 40, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'red'; ctx.fillRect(770, 420, 10, 40);

  // Vẽ điểm xây
  state.buildSpots.forEach(s => {
    ctx.fillStyle = '#8e44ad'; ctx.fillRect(s.x-15, s.y-15, 30, 30);
  });

  // Vẽ tháp & tầm bắn
  state.towers.forEach(t => {
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x, t.y, 20, 0, Math.PI*2); ctx.fill();
    if (state.selectedTower === t) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI*2); ctx.stroke();
    }
  });

  // Vẽ quái
  state.enemies.forEach(e => {
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(e.x-10, e.y-10, 20, 20);
    // HP Bar
    ctx.fillStyle = 'red'; ctx.fillRect(e.x-10, e.y-20, 20, 4);
    ctx.fillStyle = 'green'; ctx.fillRect(e.x-10, e.y-20, 20 * (e.hp/e.maxHp), 4);
  });

  // Vẽ đạn
  state.projectiles.forEach(p => {
    ctx.fillStyle = 'yellow'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
  });
}

// ==================== 3. CONTROLLER ====================
// Nút bấm chính
document.getElementById('start-btn').onclick = () => {
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('game-container').classList.remove('hidden');
  gameLoop();
};

document.getElementById('quit-btn').onclick = () => window.close();

// Xử lý Click trên Canvas
canvas.onclick = (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Kiểm tra bấm vào tháp hiện có
  const clickedTower = state.towers.find(t => Math.hypot(t.x-x, t.y-y) < 20);
  if (clickedTower) {
    state.selectedTower = clickedTower;
    showTowerMenu(e.clientX, e.clientY);
    return;
  }

  // Kiểm tra bấm vào điểm xây (Nếu đang chọn loại tháp)
  const spot = state.buildSpots.find(s => Math.hypot(s.x-x, s.y-y) < 20);
  if (spot && currentSelectedType) {
    buildTower(spot.x, spot.y);
  } else {
    state.selectedTower = null;
    document.getElementById('tower-menu').classList.add('hidden');
  }
};

let currentSelectedType = null;
document.querySelectorAll('.slot.active').forEach(s => {
  s.onclick = () => {
    currentSelectedType = s.getAttribute('data-type');
    console.log("Đã chọn tháp:", currentSelectedType);
  };
});

function buildTower(x, y) {
  const type = TOWER_TYPES[currentSelectedType];
  if (state.gold >= type.cost) {
    state.gold -= type.cost;
    state.towers.push({ ...type, x, y, lastShot: 0 });
    updateStats();
  }
}

function showTowerMenu(x, y) {
  const menu = document.getElementById('tower-menu');
  menu.classList.remove('hidden');
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

document.getElementById('sell-btn').onclick = () => {
  if (state.selectedTower) {
    state.gold += state.selectedTower.cost * 0.5;
    state.towers = state.towers.filter(t => t !== state.selectedTower);
    state.selectedTower = null;
    document.getElementById('tower-menu').classList.add('hidden');
    updateStats();
  }
};

function updateStats() {
  document.getElementById('hp-val').innerText = `${state.hp}/${state.maxHp}`;
  document.getElementById('gold-val').innerText = state.gold;
  document.getElementById('wave-val').innerText = `${state.wave}/${state.maxWaves}`;
}

// Logic Game Loop
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function update() {
  if (state.hp <= 0) return alert("GAME OVER!");

  // Wave Timer
  if (state.timer > 0) {
    state.timer -= 1/20;
    document.getElementById('timer-val').innerText = `Next in: ${Math.ceil(state.timer)}s`;
  } else if (state.wave < state.maxWaves) {
    spawnWave();
    state.timer = 20; // 1 phút giữa các wave
  }

  // Cập nhật quái
  state.enemies.forEach((e, index) => {
    const target = state.path[e.node];
    const dist = Math.hypot(target.x - e.x, target.y - e.y);
    if (dist < 2) {
      e.node++;
      if (e.node >= state.path.length) {
        state.hp--;
        state.enemies.splice(index, 1);
        updateStats();
        return;
      }
    }
    const angle = Math.atan2(target.x - e.x, target.y - e.y);
    e.x += Math.sin(angle) * e.speed;
    e.y += Math.cos(angle) * e.speed;
  });

  // Tháp tấn công
  state.towers.forEach(t => {
    const now = Date.now();
    if (now - t.lastShot > 1000) {
      const target = state.enemies.find(e => Math.hypot(e.x-t.x, e.y-t.y) < t.range);
      if (target) {
        state.projectiles.push({x: t.x, y: t.y, target, dmg: t.dmg, type: t.type});
        t.lastShot = now;
      }
    }
  });

  // Cập nhật đạn
  state.projectiles.forEach((p, i) => {
    const dist = Math.hypot(p.target.x - p.x, p.target.y - p.y);
    if (dist < 5) {
      if (p.type === 'aoe') {
        state.enemies.forEach(e => {
          if (Math.hypot(e.x-p.x, e.y-p.y) < 50) e.hp -= p.dmg;
        });
      } else {
        p.target.hp -= p.dmg;
      }
      state.projectiles.splice(i, 1);
    } else {
      const angle = Math.atan2(p.target.x - p.x, p.target.y - p.y);
      p.x += Math.sin(angle) * 7; p.y += Math.cos(angle) * 7;
    }
  });

  // Xóa quái chết
  state.enemies = state.enemies.filter(e => {
    if (e.hp <= 0) { state.gold += 10; updateStats(); return false; }
    return true;
  });
}

function spawnWave() {
  state.wave++;
  updateStats();
  for(let i=0; i<5*state.wave; i++) {
    setTimeout(() => {
      state.enemies.push({x: 0, y: 300, hp: 20, maxHp: 20, speed: 1, node: 0});
    }, i * 1000);
  }
}
