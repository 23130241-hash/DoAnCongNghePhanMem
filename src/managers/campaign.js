/* =====================================================================
 * 📄 campaign.js — BẢN ĐỒ CHIẾN DỊCH
 * ---------------------------------------------------------------------
 * UC02 — Chọn màn chơi
 *
 * Tác nhân chính : User
 * Mô tả          : Người chơi xem danh sách các màn chơi, chọn màn
 *                  đã mở khóa để bắt đầu. Màn bị khóa khi màn trước
 *                  chưa được hoàn thành.
 *
 * Luồng chính (02.1.x):
 *   02.1.0. Người chơi bấm "BẮT ĐẦU CHIẾN DỊCH" ở Main Menu.
 *   02.1.1. Hệ thống hiển thị màn hình Bản đồ Chiến dịch.
 *   02.1.2. Hệ thống render danh sách level từ GAME_CONFIG.LEVELS
 *           kèm số sao và trạng thái khóa/mở.
 *   02.1.3. Người chơi click vào một level node.
 *   02.1.4. Hệ thống kiểm tra level có bị khóa không.
 *   02.1.5. Nếu đã mở → ẩn campaign map → gọi UI_Manager.enterGame().
 *
 * Luồng thay thế (02.2.x):
 *   02.2.1. Nếu level bị khóa → hiển thị thông báo cần hoàn thành
 *           màn trước.
 *
 * Phụ thuộc:
 *   - game.js (UI_Manager, Save_Manager, GAME_CONFIG phải load trước)
 *   - upgrade_system.js (Upgrade_System, load song song hoặc sau)
 * ===================================================================== */

const Campaign_Manager = {

    /* ------------------------------------------------------------------
     * [02.1.1] Khởi tạo — chạy SAU UI_Manager.init() qua addEventListener
     * ---------------------------------------------------------------- */
    init() {
        // Override start-btn: thay vì vào thẳng game, mở campaign map
        document.getElementById('start-btn').onclick = () => {
            Campaign_Manager.show(); // 02.1.0 → 02.1.1
        };

        // Nút "Quay lại" trên campaign map → về main menu thật sự
        const backBtn2 = document.getElementById('back-to-menu-btn');
        if (backBtn2) {
            backBtn2.onclick = () => {
                Campaign_Manager.hide();
                document.getElementById('main-menu').classList.remove('hidden');
            };
        }

        // Nút "Upgrade / Buy Tower" trên campaign map
        document.getElementById('open-upgrade-btn').onclick = () => {
            Campaign_Manager.hide();
            Upgrade_System.show();
        };

        // Nút back trên upgrade screen trả về campaign
        const backBtn = document.getElementById('cancel-upgrade-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                Upgrade_System.hide();
                Campaign_Manager.show();
            };
        }

        // [Patch] UI_Manager.backToMainMenu → về campaign map thay vì main menu
        const _origBack = UI_Manager.backToMainMenu.bind(UI_Manager);
        UI_Manager.backToMainMenu = function () {
            _origBack();                         // chạy logic gốc (clear state...)
            // Sau khi gốc show main-menu, ta chuyển sang campaign map
            document.getElementById('main-menu').classList.add('hidden');
            Campaign_Manager.show();
        };

        // [Patch] next-level-btn: sau khi qua màn → về campaign chứ không alert
        document.getElementById('next-level-btn').onclick = () => {
            UI_Manager.hideVictory();
            UI_Manager.backToMainMenu();         // về campaign (đã patch ở trên)
        };

        // [UC05 - Patch] UI_Manager.enterGame: Tự động kích hoạt các tháp đã mở khóa trước khi vào trận.
        const _origEnter = UI_Manager.enterGame.bind(UI_Manager);
        UI_Manager.enterGame = function (levelId) {
            Upgrade_System.applyUnlockedSlots(); // Đảm bảo người chơi có thể chọn tháp đã mua (Step #1 UC05)
            _origEnter(levelId);
        };
    },

    /* ------------------------------------------------------------------
     * [02.1.1] Hiển thị màn hình Bản đồ Chiến dịch
     * ---------------------------------------------------------------- */
    show() {
        Save_Manager.load();
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('campaign-map').classList.remove('hidden');
        this._updateStarsHeader();
        this._renderLevels(); // 02.1.2
    },

    /* Ẩn campaign map */
    hide() {
        document.getElementById('campaign-map').classList.add('hidden');
    },

    /* ------------------------------------------------------------------
     * [02.1.2] Render danh sách level node từ config
     * ---------------------------------------------------------------- */
    _renderLevels() {
        const container = document.querySelector('.level-nodes');
        if (!container) return;
        container.innerHTML = ''; // clear static HTML

        const levels = GAME_CONFIG.LEVELS;
        const completed = GAME_CONFIG.SAVE_DATA.completedLevels;

        Object.keys(levels).forEach((id, idx) => {
            const levelId = parseInt(id);
            const lvData  = levels[levelId];

            // [UC09 - WIP] Bỏ qua level đang phát triển (cờ wip trong config)
            if (lvData.wip) return;

            const stars   = completed[levelId] || 0;

            // Level 1 luôn mở; các level sau cần màn trước hoàn thành
            const prevDone = levelId === 1 || (completed[levelId - 1] && completed[levelId - 1] > 0);
            const isLocked = !prevDone;

            // --- Build node ---
            const node = document.createElement('div');
            node.className = 'campaign-node' + (isLocked ? ' locked' : '');
            node.dataset.level = levelId;

            // Số màn + tên
            node.innerHTML = `
                <div class="cn-number">${levelId}</div>
                <div class="cn-name">${lvData.name}</div>
                <div class="cn-stars">${this._starHTML(stars)}</div>
                <div class="cn-waves">🌊 ${lvData.waves.length} wave</div>
                ${isLocked ? '<div class="cn-lock">🔒</div>' : ''}
            `;

            node.onclick = () => this._selectLevel(levelId, isLocked);
            container.appendChild(node);
        });
    },

    /* ------------------------------------------------------------------
     * [02.1.3 → 02.1.5 | 02.2.1] Người chơi click chọn level
     * ---------------------------------------------------------------- */
    _selectLevel(levelId, isLocked) {
        if (isLocked) {
            // 02.2.1 — Màn bị khóa
            this._showCampaignMsg('🔒 Hoàn thành màn trước để mở khóa!', '#e74c3c');
            return;
        }
        // 02.1.5 — Mở màn chơi
        this.hide();
        UI_Manager.enterGame(levelId);  // đã patch ở init để apply slots
    },

    /* ------------------------------------------------------------------
     * Helper: render sao (★ xám / ★ vàng)
     * ---------------------------------------------------------------- */
    _starHTML(count) {
        let html = '';
        for (let i = 1; i <= 3; i++) {
            html += `<span class="cn-star ${i <= count ? 'earned' : ''}">${i <= count ? '⭐' : '☆'}</span>`;
        }
        return html;
    },

    /* Cập nhật tổng sao ở góc phải */
    _updateStarsHeader() {
        const el = document.getElementById('total-stars-val');
        if (el) el.innerText = GAME_CONFIG.SAVE_DATA.totalStars || 0;
    },

    /* Thông báo nhỏ trong campaign map */
    _showCampaignMsg(msg, color = '#f1c40f') {
        let el = document.getElementById('campaign-msg');
        if (!el) {
            el = document.createElement('div');
            el.id = 'campaign-msg';
            document.getElementById('campaign-map').appendChild(el);
        }
        el.innerText = msg;
        el.style.color = color;
        el.style.opacity = '1';
        clearTimeout(this._msgTimer);
        this._msgTimer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
    }
};

/* Chạy SAU UI_Manager.init() (game.js dùng window.onload=, không overwrite) */
window.addEventListener('load', () => {
    Campaign_Manager.init();
});