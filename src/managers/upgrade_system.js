/* =====================================================================
 * 📄 upgrade_system.js — HỆ THỐNG MỞ KHÓA / TIẾN HÓA THÁP
 * ---------------------------------------------------------------------
 * UC20 — Mở bảng Mở khóa/Tiến hóa Tháp
 * UC21 — Xem thông tin Mở khóa/Tiến hóa tháp
 * UC22 — Mở khóa tháp mới
 * UC23 — Tiến hóa tháp đã có
 *
 * Tác nhân chính : User
 * Phụ thuộc     : GAME_CONFIG (config.js), Save_Manager (game.js)
 *
 * Luồng chính:
 *   20.1.1. Người chơi bấm "Upgrade / Buy Tower" trên campaign map.
 *   20.1.2. Hệ thống hiển thị màn hình shop với tất cả tháp.
 *   21.1.1. Người chơi click vào một tháp → xem chi tiết.
 *   21.1.2. Hệ thống hiển thị thống số, trạng thái, chi phí.
 *   22.1.1. Người chơi bấm "Mở khóa" (tháp chưa có).
 *   22.1.2. Hệ thống kiểm tra sao đủ không.
 *   22.1.3. Trừ sao, đánh dấu unlocked, inject vào GAME_CONFIG.TOWERS.
 *   23.1.1. Người chơi bấm "Tiến hóa" (tháp đã có).
 *   23.1.2. Hệ thống trừ sao, thêm level mới vào tower config.
 *
 * Luồng thay thế:
 *   22.2.1. Sao không đủ → hiện thông báo.
 *   23.2.1. Sao không đủ → hiện thông báo.
 * ===================================================================== */

/* ------------------------------------------------------------------
 * DANH MỤC THÁP CÓ THỂ MỞ KHÓA (UC22)
 * Những tháp này ban đầu KHÔNG có trong GAME_CONFIG.TOWERS.
 * Khi người chơi đủ sao và bấm mở khóa, chúng sẽ được inject vào.
 * ---------------------------------------------------------------- */
const TOWER_SHOP_CATALOG = {
    frost: {
        name:        "Tháp Băng",
        description: "Làm chậm kẻ thù trong phạm vi, tốt để hỗ trợ các tháp khác tiêu diệt dễ hơn.",
        unlockCost:  5,       // ⭐ cần để mở khóa
        icon:        '❄️',
        color:       '#1abc9c',
        attackType:  'aoe',   // dùng AOE có sẵn; slow sẽ là tính năng mở rộng sau
        levels: [
            { lvl: 1, cost: 80,  range: 130, dmg: 6,  cd: 900, explosionRadius: 55, icon: '❄️' },
            { lvl: 2, cost: 120, range: 150, dmg: 10, cd: 850, explosionRadius: 70, icon: '❄️' }
        ]
    },
    sniper: {
        name:        "Tháp Bắn Tỉa",
        description: "Tầm bắn cực xa, sát thương rất cao, chỉ bắn một mục tiêu mỗi lần.",
        unlockCost:  8,       // ⭐
        icon:        '🎯',
        color:       '#8e44ad',
        attackType:  'single',
        levels: [
            { lvl: 1, cost: 120, range: 280, dmg: 55, cd: 2200, icon: '🎯' },
            { lvl: 2, cost: 185, range: 320, dmg: 85, cd: 2000, icon: '🎯' }
        ]
    }
};

/* ------------------------------------------------------------------
 * DANH MỤC TIẾN HÓA THÁP (UC23)
 * Thêm level cao hơn cho những tháp đã có sẵn trong config.
 * ---------------------------------------------------------------- */
const TOWER_EVOLVE_CATALOG = {
    archer: {
        evolveCost:  4,       // ⭐ cần để tiến hóa
        description: "Tiến hóa tháp Cung Thủ lên tier 2: mở khóa Level 4 tăng tốc bắn và sát thương.",
        extraLevel:  { lvl: 4, cost: 175, range: 230, dmg: 40, cd: 620, icon: '🏹' }
    },
    cannon: {
        evolveCost:  6,       // ⭐
        description: "Tiến hóa tháp Pháo lên tier 2: mở khóa Level 3 nổ mạnh hơn với bán kính lớn hơn.",
        extraLevel:  { lvl: 3, cost: 225, range: 140, dmg: 60, cd: 1300, explosionRadius: 80, icon: '💣' }
    }
};

/* ------------------------------------------------------------------
 * Upgrade_System — Object singleton quản lý toàn bộ UC20-23
 * ---------------------------------------------------------------- */
const Upgrade_System = {
    selectedType: null,   // loại tháp đang được chọn trong detail panel
    _msgTimer: null,

    /* ----------------------------------------------------------------
     * [20.1.1] init — kết nối các event (chạy sau window load)
     * -------------------------------------------------------------- */
    init() {
        // confirm-upgrade-btn: tùy ngữ cảnh là Unlock hay Evolve
        document.getElementById('confirm-upgrade-btn').onclick = () => {
            this._handleConfirm();
        };
        // cancel → wired in campaign.js
    },

    /* ----------------------------------------------------------------
     * [20.1.2] Hiển thị màn hình shop
     * -------------------------------------------------------------- */
    show() {
        Save_Manager.load();
        document.getElementById('upgrade-screen').classList.remove('hidden');
        this._renderShop();
        this._clearDetail();
    },

    hide() {
        document.getElementById('upgrade-screen').classList.add('hidden');
        this.selectedType = null;
    },

    /* ----------------------------------------------------------------
     * [20.1.2] Render toàn bộ tháp: có sẵn + cửa hàng
     * -------------------------------------------------------------- */
    _renderShop() {
        const container = document.getElementById('upgrade-tree-view');
        if (!container) return;
        container.innerHTML = '';

        const stars = GAME_CONFIG.SAVE_DATA.totalStars || 0;

        // Header
        const header = document.createElement('div');
        header.className = 'us-header';
        header.innerHTML = `
            <h2 class="us-title">⚔️ XƯỞNG THÁP</h2>
            <div class="us-stars-display">⭐ Sao hiện có: <strong id="us-stars-val">${stars}</strong></div>
        `;
        container.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'us-grid';
        container.appendChild(grid);

        // --- Phần 1: Tháp đã có sẵn (có thể tiến hóa) ---
        const sectionBase = document.createElement('div');
        sectionBase.className = 'us-section';
        sectionBase.innerHTML = '<h3 class="us-section-title">🏰 Tháp đang sở hữu</h3>';
        grid.appendChild(sectionBase);

        Object.entries(GAME_CONFIG.TOWERS).forEach(([type, tData]) => {
            if (type === 'sellRatio') return; // skip scalar
            const evolved  = this._isEvolved(type);
            const canEvolve = TOWER_EVOLVE_CATALOG[type] && !evolved;
            const card = this._makeCard({
                type, icon: tData.levels[0].icon,
                name: tData.name,
                tag: evolved ? '✅ Đã tiến hóa' : (canEvolve ? `Tiến hóa: ${TOWER_EVOLVE_CATALOG[type].evolveCost}⭐` : '✅ Tối đa'),
                tagClass: evolved ? 'tag-done' : (canEvolve ? 'tag-evolve' : 'tag-done'),
                locked: false
            });
            sectionBase.appendChild(card);
        });

        // --- Phần 2: Tháp trong cửa hàng (mở khóa bằng sao) ---
        const sectionShop = document.createElement('div');
        sectionShop.className = 'us-section';
        sectionShop.innerHTML = '<h3 class="us-section-title">🔓 Tháp có thể mở khóa</h3>';
        grid.appendChild(sectionShop);

        Object.entries(TOWER_SHOP_CATALOG).forEach(([type, tData]) => {
            const unlocked = this._isUnlocked(type);
            const card = this._makeCard({
                type, icon: tData.icon,
                name: tData.name,
                tag: unlocked ? '✅ Đã mở khóa' : `🔒 Mở: ${tData.unlockCost}⭐`,
                tagClass: unlocked ? 'tag-done' : 'tag-lock',
                locked: !unlocked
            });
            sectionShop.appendChild(card);
        });
    },

    /* Helper tạo card tháp */
    _makeCard({ type, icon, name, tag, tagClass, locked }) {
        const card = document.createElement('div');
        card.className = 'us-card' + (locked ? ' us-locked' : '');
        card.dataset.type = type;
        card.innerHTML = `
            <div class="us-card-icon">${icon}</div>
            <div class="us-card-name">${name}</div>
            <div class="us-card-tag ${tagClass}">${tag}</div>
        `;
        card.onclick = () => this._selectTower(type); // UC21
        return card;
    },

    /* ----------------------------------------------------------------
     * [UC21] Xem thông tin tháp được chọn
     * -------------------------------------------------------------- */
    _selectTower(type) {
        this.selectedType = type;

        // Highlight card
        document.querySelectorAll('.us-card').forEach(c =>
            c.classList.toggle('us-selected', c.dataset.type === type));

        const detailPanel = document.getElementById('upgrade-details');
        const nameEl = document.getElementById('up-name');
        const descEl = document.getElementById('up-desc');
        const costEl = document.getElementById('up-cost');
        const confirmBtn = document.getElementById('confirm-upgrade-btn');

        detailPanel.classList.remove('hidden');

        // Xác định đây là tháp nào
        const isBase = !!GAME_CONFIG.TOWERS[type];
        const isShop = !!TOWER_SHOP_CATALOG[type];

        if (isBase) {
            // Tháp có sẵn → xem tiến hóa
            const tData = GAME_CONFIG.TOWERS[type];
            const evolve = TOWER_EVOLVE_CATALOG[type];
            const evolved = this._isEvolved(type);

            nameEl.innerText = tData.name;

            // Bảng chỉ số các level hiện tại
            let statsHtml = '<b>Chỉ số hiện tại:</b><br>';
            tData.levels.forEach(lv => {
                statsHtml += `Lv${lv.lvl}: DMG ${lv.dmg} | Range ${lv.range} | CD ${lv.cd}ms<br>`;
            });

            if (evolve && !evolved) {
                const ex = evolve.extraLevel;
                statsHtml += `<br><b style="color:#f1c40f">Sau tiến hóa thêm Lv${ex.lvl}:</b><br>`;
                statsHtml += `DMG ${ex.dmg} | Range ${ex.range} | CD ${ex.cd}ms`;
                descEl.innerHTML = evolve.description + '<br><br>' + statsHtml;
                costEl.innerText = evolve.evolveCost + ' ⭐';
                confirmBtn.innerText = '✨ TIẾN HÓA';
                confirmBtn.disabled = false;
            } else if (evolved) {
                descEl.innerHTML = 'Tháp đã đạt cấp độ tiến hóa tối đa.<br><br>' + statsHtml;
                costEl.innerText = '—';
                confirmBtn.innerText = '✅ ĐÃ TIẾN HÓA';
                confirmBtn.disabled = true;
            } else {
                descEl.innerHTML = 'Tháp này không có bản tiến hóa.<br><br>' + statsHtml;
                costEl.innerText = '—';
                confirmBtn.innerText = 'Không có';
                confirmBtn.disabled = true;
            }

        } else if (isShop) {
            // Tháp trong shop → xem mở khóa
            const tData = TOWER_SHOP_CATALOG[type];
            const unlocked = this._isUnlocked(type);

            nameEl.innerText = tData.name;

            let statsHtml = '<b>Chỉ số khi mở khóa:</b><br>';
            tData.levels.forEach(lv => {
                statsHtml += `Lv${lv.lvl}: DMG ${lv.dmg} | Range ${lv.range} | CD ${lv.cd}ms<br>`;
            });

            descEl.innerHTML = tData.description + '<br><br>' + statsHtml;

            if (unlocked) {
                costEl.innerText = '—';
                confirmBtn.innerText = '✅ ĐÃ MỞ KHÓA';
                confirmBtn.disabled = true;
            } else {
                costEl.innerText = tData.unlockCost + ' ⭐';
                confirmBtn.innerText = `🔓 MỞ KHÓA (${tData.unlockCost}⭐)`;
                confirmBtn.disabled = false;
            }
        }
    },

    /* ----------------------------------------------------------------
     * [UC22 / UC23] Người chơi bấm Confirm → mở khóa hoặc tiến hóa
     * -------------------------------------------------------------- */
    _handleConfirm() {
        if (!this.selectedType) return;
        const type = this.selectedType;

        if (TOWER_SHOP_CATALOG[type]) {
            this._unlockTower(type); // UC22
        } else if (GAME_CONFIG.TOWERS[type] && TOWER_EVOLVE_CATALOG[type]) {
            this._evolveTower(type); // UC23
        }
    },

    /* ----------------------------------------------------------------
     * [UC22] Mở khóa tháp mới
     * -------------------------------------------------------------- */
    _unlockTower(type) {
        const tData   = TOWER_SHOP_CATALOG[type];
        const stars   = GAME_CONFIG.SAVE_DATA.totalStars || 0;
        const cost    = tData.unlockCost;

        if (stars < cost) {
            // 22.2.1 — Không đủ sao
            this._showMsg(`❌ Cần ${cost}⭐ — hiện có ${stars}⭐`, '#e74c3c');
            return;
        }

        // 22.1.3 — Trừ sao + đánh dấu unlocked
        GAME_CONFIG.SAVE_DATA.totalStars -= cost;
        if (!GAME_CONFIG.SAVE_DATA.unlockedUpgrades.includes(type)) {
            GAME_CONFIG.SAVE_DATA.unlockedUpgrades.push(type);
        }

        // Inject vào GAME_CONFIG.TOWERS để game có thể dùng
        GAME_CONFIG.TOWERS[type] = {
            name:       tData.name,
            color:      tData.color,
            attackType: tData.attackType,
            levels:     tData.levels
        };

        Save_Manager.save();
        this._showMsg(`✅ Đã mở khóa ${tData.name}!`, '#2ecc71');
        this._renderShop();
        this._selectTower(type); // cập nhật detail panel

        // Cập nhật sao header
        const starsEl = document.getElementById('us-stars-val');
        if (starsEl) starsEl.innerText = GAME_CONFIG.SAVE_DATA.totalStars;
    },

    /* ----------------------------------------------------------------
     * [UC23] Tiến hóa tháp đã có
     * -------------------------------------------------------------- */
    _evolveTower(type) {
        const evolve  = TOWER_EVOLVE_CATALOG[type];
        const stars   = GAME_CONFIG.SAVE_DATA.totalStars || 0;
        const cost    = evolve.evolveCost;

        if (stars < cost) {
            // 23.2.1 — Không đủ sao
            this._showMsg(`❌ Cần ${cost}⭐ — hiện có ${stars}⭐`, '#e74c3c');
            return;
        }

        // 23.1.2 — Trừ sao + thêm level vào config
        GAME_CONFIG.SAVE_DATA.totalStars -= cost;
        const evolveKey = `evolved_${type}`;
        if (!GAME_CONFIG.SAVE_DATA.unlockedUpgrades.includes(evolveKey)) {
            GAME_CONFIG.SAVE_DATA.unlockedUpgrades.push(evolveKey);
        }

        // Thêm extraLevel vào levels[] của tháp trong config
        const tower = GAME_CONFIG.TOWERS[type];
        const alreadyHas = tower.levels.some(lv => lv.lvl === evolve.extraLevel.lvl);
        if (!alreadyHas) {
            tower.levels.push(evolve.extraLevel);
        }

        Save_Manager.save();
        this._showMsg(`✨ ${tower.name} đã tiến hóa!`, '#f1c40f');
        this._renderShop();
        this._selectTower(type);

        const starsEl = document.getElementById('us-stars-val');
        if (starsEl) starsEl.innerText = GAME_CONFIG.SAVE_DATA.totalStars;
    },

    /* ----------------------------------------------------------------
     * applyUnlockedSlots — gọi trước enterGame để active các slot đã mở
     * ---------------------------------------------------------------- */
    applyUnlockedSlots() {
        const unlocked = (GAME_CONFIG.SAVE_DATA.unlockedUpgrades || [])
            .filter(k => !k.startsWith('evolved_') && TOWER_SHOP_CATALOG[k]);
        if (unlocked.length === 0) return;

        const lockedSlots = document.querySelectorAll('#tower-slots .slot.locked');
        unlocked.forEach((type, idx) => {
            const slot = lockedSlots[idx];
            if (!slot) return;
            const tData = TOWER_SHOP_CATALOG[type];
            // Activate slot
            slot.classList.remove('locked');
            slot.classList.add('active');
            slot.dataset.type = type;
            slot.dataset.cost = tData.levels[0].cost;
            slot.querySelector('.icon').innerText = tData.icon;
            slot.querySelector('.cost').innerText = `${tData.levels[0].cost}g`;

            // Bind click (UI_Manager._bindTowerSlots không cover slot mới)
            slot.onclick = () => {
                if (!slot.classList.contains('active')) return;
                document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
                slot.classList.add('selected');
                UI_Manager.selectedTowerSlot = {
                    type: slot.dataset.type,
                    cost: parseInt(slot.dataset.cost)
                };
            };
        });
    },

    /* ----------------------------------------------------------------
     * Helpers
     * -------------------------------------------------------------- */
    _isUnlocked(type) {
        return (GAME_CONFIG.SAVE_DATA.unlockedUpgrades || []).includes(type);
    },
    _isEvolved(type) {
        return (GAME_CONFIG.SAVE_DATA.unlockedUpgrades || []).includes(`evolved_${type}`);
    },
    _clearDetail() {
        document.getElementById('upgrade-details').classList.add('hidden');
        document.getElementById('confirm-upgrade-btn').disabled = true;
        document.getElementById('confirm-upgrade-btn').innerText = 'CHỌN THÁP';
    },
    _showMsg(msg, color = '#f1c40f') {
        let el = document.getElementById('us-msg');
        if (!el) {
            el = document.createElement('div');
            el.id = 'us-msg';
            document.getElementById('upgrade-screen').appendChild(el);
        }
        el.innerText = msg;
        el.style.color = color;
        el.style.opacity = '1';
        clearTimeout(this._msgTimer);
        this._msgTimer = setTimeout(() => { el.style.opacity = '0'; }, 2200);
    }
};

/* Chạy sau UI_Manager.init() */
window.addEventListener('load', () => {
    Upgrade_System.init();
});