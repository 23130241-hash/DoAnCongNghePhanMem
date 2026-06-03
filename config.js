/* =====================================================================
 * 📄 config.js — TỪ ĐIỂN CẤU HÌNH TRÒ CHƠI (DATA-DRIVEN)
 * ---------------------------------------------------------------------
 * Đáp ứng [BO-02] SCALABILITY trong BRD:
 *   "Hệ thống cho phép thêm mới TRỤ và QUÁI chỉ bằng cách thay đổi
 *    cấu hình dữ liệu (JSON/CSV)."
 *
 * Để THÊM một map / level / quái / tháp mới → CHỈ SỬA FILE NÀY,
 * KHÔNG ĐỘNG TỚI game.js.
 * ===================================================================== */

const GAME_CONFIG = {

    /* -----------------------------------------------------------------
     * 1) MAPS — Bản đồ (đường đi & vị trí đặt tháp)
     * -----------------------------------------------------------------
     * Để thêm map mới: copy 1 entry, đổi key, sửa path & buildSpots.
     *   - path:        Mảng waypoint kẻ thù sẽ đi qua, theo thứ tự.
     *   - buildSpots:  Vị trí có thể đặt tháp.
     *   - base:        Tọa độ căn cứ (cuối đường + vùng "an toàn").
     *   - spawn:       Tọa độ điểm spawn quái (= path[0]).
     * ---------------------------------------------------------------- */
    MAPS: {
        map01: {
            name: "Cửa ngõ vương quốc",
            background: "#27ae60",
            pathColor: "#e67e22",
            pathInnerColor: "#d35400",
            path: [
                { x: -50, y: 300 }, { x: 250, y: 300 },
                { x: 250, y: 180 }, { x: 550, y: 180 },
                { x: 550, y: 450 }, { x: 950, y: 450 }
            ],
            buildSpots: [
                { x: 180, y: 220 }, { x: 400, y: 120 },
                { x: 620, y: 220 }, { x: 400, y: 380 },
                { x: 750, y: 350 }
            ],
            base: { x: 900, y: 450, radius: 60 }
        },
        map02: {
            name: "Đèo sương mù",
            background: "#34495e",
            pathColor: "#95a5a6",
            pathInnerColor: "#7f8c8d",
            path: [
                { x: -50, y: 100 }, { x: 200, y: 100 },
                { x: 200, y: 350 }, { x: 450, y: 350 },
                { x: 450, y: 150 }, { x: 700, y: 150 },
                { x: 700, y: 500 }, { x: 950, y: 500 }
            ],
            buildSpots: [
                { x: 120, y: 220 }, { x: 320, y: 220 },
                { x: 320, y: 450 }, { x: 570, y: 250 },
                { x: 570, y: 450 }, { x: 800, y: 350 }
            ],
            base: { x: 900, y: 500, radius: 60 }
        },

        /* [UC09 - Commit 1] Map 3 — Pháo đài bóng tối
         * Theme tối, đường đi dạng zigzag dài hơn để tăng độ khó,
         * tạo thử thách cho boss wave ở level 3.                     */
        map03: {
            name: "Pháo đài bóng tối",
            background: "#1a0f0a",
            pathColor: "#5d4037",
            pathInnerColor: "#3e2723",
            path: [
                { x: -50, y: 250 }, { x: 150, y: 250 },
                { x: 150, y: 100 }, { x: 350, y: 100 },
                { x: 350, y: 400 }, { x: 550, y: 400 },
                { x: 550, y: 200 }, { x: 750, y: 200 },
                { x: 750, y: 500 }, { x: 950, y: 500 }
            ],
            buildSpots: [
                { x: 80,  y: 180 }, { x: 240, y: 180 },
                { x: 260, y: 320 }, { x: 450, y: 250 },
                { x: 450, y: 480 }, { x: 650, y: 120 },
                { x: 650, y: 320 }, { x: 820, y: 350 }
            ],
            base: { x: 900, y: 500, radius: 60 }
        }
    },

    /* -----------------------------------------------------------------
     * 2) ENEMIES — Loại kẻ thù
     * -----------------------------------------------------------------
     * Để thêm quái mới: copy 1 entry, đổi key & chỉ số.
     *   - damage:  Sát thương căn cứ khi lọt vào (theo BR sequence).
     * ---------------------------------------------------------------- */
    ENEMIES: {
        creep:      { name: "Creep",  hp: 40,  speed: 1.2, reward: 15, size: 16, damage: 1, color: '#c0392b', icon: '👾' },
        fast_creep: { name: "Scout",  hp: 25,  speed: 2.0, reward: 20, size: 14, damage: 1, color: '#8e44ad', icon: '🏃' },
        tank:       { name: "Tank",   hp: 150, speed: 0.6, reward: 40, size: 22, damage: 3, color: '#2c3e50', icon: '🛡️' },

        /* [UC09 - Commit 1] Skeleton — quái độc quyền map03 (Pháo đài bóng tối)
         * Đặc trưng: máu trung bình, tốc độ khá nhanh, sát thương 2 —
         * mạnh hơn creep nhưng yếu hơn tank. Tạo cảm giác riêng cho
         * theme "undead fortress" của map03.                          */
        skeleton:   { name: "Skeleton", hp: 60, speed: 1.3, reward: 25, size: 18, damage: 2, color: '#ecf0f1', icon: '💀' },

        /* [UC09 - Commit 1] Boss enemy — loại quái đặc biệt
         * isBoss: true  → Wave_Manager sẽ hiển thị cảnh báo đặc biệt
         *                  và render health bar riêng trên giao diện.
         * Spawn bởi wave_manager.js khi gặp wave có boss type.       */
        boss:       { name: "Boss",   hp: 1000, speed: 0.5, reward: 100, size: 30, damage: 5, color: '#8b0000', icon: '👹', isBoss: true }
    },

    /* -----------------------------------------------------------------
     * 3) TOWERS — Loại tháp (hỗ trợ nâng cấp nhiều cấp)
     * -----------------------------------------------------------------
     * sellRatio áp dụng chung cho tất cả tháp.
     * Để thêm tháp mới: copy 1 entry, đổi key & levels.
     * Mỗi level kế tiếp PHẢI có cost ≥ 1.5x level trước (BR-03).
     * ---------------------------------------------------------------- */
    TOWERS: {
        sellRatio: 0.5,
        archer: {
            name: "Tháp Cung Thủ",
            color: '#3498db',
            attackType: 'single',
            levels: [
                { lvl: 1, cost: 50,  range: 150, dmg: 10, cd: 800, icon: '🏹' },
                { lvl: 2, cost: 75,  range: 170, dmg: 15, cd: 750, icon: '🏹' },
                { lvl: 3, cost: 115, range: 200, dmg: 25, cd: 700, icon: '🏹' }
            ]
        },
        cannon: {
            name: "Tháp Pháo",
            color: '#e74c3c',
            attackType: 'aoe',
            levels: [
                { lvl: 1, cost: 100, range: 100, dmg: 25, cd: 1500, explosionRadius: 50, icon: '💣' },
                { lvl: 2, cost: 150, range: 120, dmg: 40, cd: 1400, explosionRadius: 65, icon: '💣' }
            ]
        }
        // GỢI Ý mở rộng (BO-02): thêm "frost" — tháp làm chậm
        // frost: { name:"Tháp Băng", color:'#1abc9c', attackType:'slow',
        //   levels:[{lvl:1, cost:80, range:120, dmg:5, cd:900, slowFactor:0.5, slowDuration:1500, icon:'❄️'}] }
    },

    /* -----------------------------------------------------------------
     * 4) LEVELS — Màn chơi (nối với MAPS qua mapId)
     * -----------------------------------------------------------------
     * Để thêm level mới: copy 1 entry, đổi key, mapId, waves.
     *   - waveDelay: Khoảng nghỉ (ms) giữa 2 wave.
     *   - waves[].interval: Khoảng cách spawn giữa 2 quái trong wave.
     *   - waves[].count:    Tổng số quái trong wave.
     * ---------------------------------------------------------------- */
    LEVELS: {
        1: {
            name: "Cửa ngõ vương quốc",
            mapId: "map01",
            startMoney: 300,
            startHP: 20,
            waveDelay: 8000,
            waves: [
                { enemyType: 'creep',      count: 10, interval: 1000 },
                { enemyType: 'fast_creep', count: 15, interval: 800 },
                { enemyType: 'creep',      count: 20, interval: 700 }
            ]
        },
        2: {
            name: "Đèo sương mù",
            mapId: "map02",
            startMoney: 350,
            startHP: 20,
            waveDelay: 8000,
            waves: [
                { enemyType: 'creep',      count: 12, interval: 900 },
                { enemyType: 'fast_creep', count: 18, interval: 700 },
                { enemyType: 'tank',       count: 5,  interval: 2000 },
                { enemyType: 'fast_creep', count: 25, interval: 600 }
            ]
        },

        /* [UC09 - Commit 1] Level 3 — Pháo đài bóng tối
         * Sử dụng format wave mới hỗ trợ mixed enemy types (groups).
         * wave_manager.js sẽ nhận ra format { groups: [...] } và
         * spawn tuần tự từng group trong cùng một wave.
         * Wave cuối là boss wave — sẽ trigger cảnh báo đặc biệt.  */
        3: {
            // [UC09 - 09.1.3] Wave_Manager đã hỗ trợ format groups → mở khóa.
            name: "Pháo đài bóng tối",
            mapId: "map03",
            startMoney: 400,
            startHP: 20,
            waveDelay: 9000,
            waves: [
                // Wave 1 — giới thiệu Skeleton (quái độc quyền map03)
                { enemyType: 'skeleton', count: 12, interval: 800 },

                // Wave 2 — Wave hỗn hợp (format mới — groups)
                // [UC09] wave_manager._spawnGroups() xử lý format này
                {
                    groups: [
                        { enemyType: 'skeleton',   count: 8,  interval: 600 },
                        { enemyType: 'fast_creep', count: 10, interval: 500 },
                        { enemyType: 'tank',       count: 4,  interval: 1800 }
                    ]
                },

                // Wave 3 — Boss wave (isBoss=true sẽ trigger cảnh báo đỏ)
                { enemyType: 'boss', count: 1, interval: 5000 }
            ]
        }
    },

    /* -----------------------------------------------------------------
     * 5) GAMEPLAY — Tham số chung
     * ---------------------------------------------------------------- */
    GAMEPLAY: {
        canvasWidth: 900,
        canvasHeight: 600,
        firstWaveDelay: 2000,        // Delay (ms) khi mới vào màn
        baseHitRadius: 50,           // Bán kính "vùng an toàn" của căn cứ
        projectileSpeed: 12,
        explosionGrowthRate: 3,
        explosionFadeRate: 0.05,
        towerHitRadius: 25,          // Khoảng cách click để mở menu tháp
        buildSpotSnapDistance: 35    // Khoảng cách click để snap vào build spot
    },

    /* -----------------------------------------------------------------
     * 6) SAVE_DATA — Dữ liệu lưu cục bộ (sao của template trên localStorage)
     * ---------------------------------------------------------------- */
    SAVE_DATA: {
        totalStars: 0,
        unlockedUpgrades: [],
        completedLevels: {}
    }
};

// Cho phép kiểm tra cấu hình ở console (debug)
if (typeof window !== 'undefined') window.GAME_CONFIG = GAME_CONFIG;