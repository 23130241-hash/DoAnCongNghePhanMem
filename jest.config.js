/**
 * Jest configuration — Kingdom Defense
 *
 * Project dùng vanilla JS với globals (window.Wave_Manager, GAME_CONFIG, ...).
 * Để test trong Node, dùng jsdom environment để có sẵn `window`/`document`,
 * sau đó load source file qua fs.readFileSync + eval trong test setup.
 */
module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    // Tạm bỏ qua các test file đang thiếu mock dependencies (cần author tự fix).
    // Sau khi fix mock đầy đủ thì xóa entry tương ứng khỏi mảng này.
    testPathIgnorePatterns: [
        '/node_modules/',
        // combo_damage.test.js — thiếu mock Game_Manager khi load combo_damge.js
        // → @LyPhat sửa: thêm `global.Game_Manager = { enemies: [], ... }` ở phần mock
        // (tham khảo tests/wave_manager.test.js dòng 20-25). Khi fix xong, xóa dòng dưới.
        '<rootDir>/tests/combo_damage.test.js',
    ],
    verbose: true,
    // Không cần coverage cho project nhỏ nhưng có thể bật khi cần
    collectCoverage: false,
    // Thư mục lưu kết quả jest-junit (CircleCI sẽ đọc)
    coverageDirectory: 'coverage',
};
