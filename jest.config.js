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
    verbose: true,
    // Không cần coverage cho project nhỏ nhưng có thể bật khi cần
    collectCoverage: false,
    // Thư mục lưu kết quả jest-junit (CircleCI sẽ đọc)
    coverageDirectory: 'coverage',
};
