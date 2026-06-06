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
     * Để thêm map mới: copy 1 entry, đổi key, sửa paths & buildSpots.
     *   - paths:       Mảng CÁC path. Mỗi path là mảng waypoint quái đi qua.
     *                  Map cũ chỉ có 1 path → paths: [[...]]
     *                  Map mới có thể có nhiều path → paths: [[A...], [B...]]
     *   - buildSpots:  Vị trí có thể đặt tháp.
     *   - base:        Tọa độ căn cứ (cuối đường + vùng "an toàn").
     *   - spawn:       Tọa độ điểm spawn quái mỗi path (= paths[i][0]).
     * ---------------------------------------------------------------- */
    MAPS: {
        map01: {
            name: "Cửa ngõ vương quốc",
            background: "#27ae60",
            pathColor: "#e67e22",
            pathInnerColor: "#d35400",
            paths: [
                // Path 0 — đường đi duy nhất của map01
                [
                    { x: -50, y: 300 }, { x: 250, y: 300 },
                    { x: 250, y: 180 }, { x: 550, y: 180 },
                    { x: 550, y: 450 }, { x: 950, y: 450 }
                ]
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
            paths: [
                // Path 0 — đường đi duy nhất của map02
                [
                    { x: -50, y: 100 }, { x: 200, y: 100 },
                    { x: 200, y: 350 }, { x: 450, y: 350 },
                    { x: 450, y: 150 }, { x: 700, y: 150 },
                    { x: 700, y: 500 }, { x: 950, y: 500 }
                ]
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
            paths: [
                // Path 0 — đường đi duy nhất của map03
                [
                    { x: -50, y: 250 }, { x: 150, y: 250 },
                    { x: 150, y: 100 }, { x: 350, y: 100 },
                    { x: 350, y: 400 }, { x: 550, y: 400 },
                    { x: 550, y: 200 }, { x: 750, y: 200 },
                    { x: 750, y: 500 }, { x: 950, y: 500 }
                ]
            ],
            buildSpots: [
                { x: 80,  y: 180 }, { x: 240, y: 180 },
                { x: 260, y: 320 }, { x: 450, y: 250 },
                { x: 450, y: 480 }, { x: 650, y: 120 },
                { x: 650, y: 320 }, { x: 820, y: 350 }
            ],
            base: { x: 900, y: 500, radius: 60 }
        },

        /* [Commit 16] Map 4 — Ngã ba phòng tuyến
         * Map đầu tiên có 2 đường spawn quái:
         *   Path 0 (A): từ phải qua trái thẳng đến base (đường ngang chính)
         *   Path 1 (B): từ dưới lên giữa rồi rẽ trái đến base (chữ L)
         * Hai path hội tụ tại base bên trái → tạo "ngã ba" phòng thủ.
         *
         * Build spots được phân bố để cover cả 2 path: nhóm trên/giữa cho
         * Path A, nhóm giữa/dưới cho Path B, và vài spot ở khu vực giao
         * cắt để có thể bắn cả 2.
         *
         * COMMIT 16 chỉ thêm cấu hình map + render. Level 4 sử dụng map
         * này (với pathIndex + format `parallel`) sẽ được thêm ở Commit 19. */
        map04: {
            name: "Ngã ba phòng tuyến",
            background: "#2c3e50",
            pathColor: "#d35400",
            pathInnerColor: "#a04000",
            paths: [
                // Path 0 (A) — phải → trái → base
                [
                    { x: 950, y: 250 }, { x: 700, y: 250 },
                    { x: 700, y: 350 }, { x: 50,  y: 350 }
                ],
                // Path 1 (B) — dưới → lên giữa → trái → base
                [
                    { x: 500, y: 650 }, { x: 500, y: 350 },
                    { x: 50,  y: 350 }
                ]
            ],
            buildSpots: [
                // Khu vực Path A (phía trên)
                { x: 820, y: 180 }, { x: 820, y: 320 },
                { x: 600, y: 180 }, { x: 600, y: 280 },
                // Khu vực Path B (phía dưới)
                { x: 420, y: 500 }, { x: 580, y: 500 },
                { x: 420, y: 250 }, { x: 580, y: 250 },
                // Khu vực giao cắt (cover cả 2 path)
                { x: 300, y: 280 }, { x: 300, y: 420 },
                { x: 180, y: 280 }, { x: 180, y: 420 }
            ],
            base: { x: 50, y: 350, radius: 60 }
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

        /* [UC09 - Commit 1] Boss enemy — loại quái đặc biệt (isBoss: true)
         * Wave_Manager sẽ hiển thị cảnh báo đặc biệt và render health bar
         * riêng trên giao diện cho bất kỳ enemy nào có isBoss=true.
         *
         * Đặt tên có hậu tố số (boss1, boss2, ...) để dễ mở rộng các loại
         * boss khác trong tương lai (boss2 nhanh hơn, boss3 hồi máu...).
         * Spawn bởi wave_manager.js khi gặp wave có enemyType là boss*.   */
        boss1:      { name: "Boss 1", hp: 1000, speed: 0.5, reward: 100, size: 30, damage: 5, color: '#8b0000', icon: '👹', isBoss: true }
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
        },
        /* [UC10 - Cải tiến] Tháp Phép Thuật
         * Bổ sung loại tháp mới để mở rộng chức năng "Tháp tấn công kẻ thù".
         *
         * Khác với:
         *   - archer: bắn đơn mục tiêu
         *   - cannon: gây sát thương diện rộng
         *
         * magic có cơ chế riêng:
         *   - attackType: 'magic' để Projectile nhận biết đây là đạn phép
         *   - gây sát thương trực tiếp lên enemy
         *   - thêm hiệu ứng slow để làm chậm tốc độ di chuyển của enemy
         *
         * slowFactor:
         *   - hệ số tốc độ còn lại của enemy sau khi bị làm chậm
         *   - ví dụ 0.65 nghĩa là enemy chỉ còn 65% tốc độ ban đầu
         *
         * slowDuration:
         *   - thời gian hiệu ứng làm chậm tồn tại, tính bằng mili-giây
         *
         * Mục đích:
         *   - tăng chiến thuật phòng thủ
         *   - giúp người chơi khống chế enemy nhanh hoặc tank
         *   - hỗ trợ các tháp sát thương cao tiêu diệt enemy hiệu quả hơn
         */
        magic: {
            name: "Tháp Phép Thuật",
            color: '#9b59b6',
            attackType: 'magic',
            levels: [
                { lvl: 1, cost: 80,  range: 130, dmg: 8,  cd: 900, slowFactor: 0.65, slowDuration: 1200, icon: '🔮' },
                { lvl: 2, cost: 120, range: 150, dmg: 13, cd: 850, slowFactor: 0.55, slowDuration: 1500, icon: '🔮' },
                { lvl: 3, cost: 180, range: 170, dmg: 20, cd: 800, slowFactor: 0.45, slowDuration: 1800, icon: '✨' }
            ]
        }
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
                { enemyType: 'boss1', count: 1, interval: 5000 }
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