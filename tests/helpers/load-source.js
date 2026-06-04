/**
 * Helper: load file vanilla JS (config.js / wave_manager.js) vào môi trường test.
 *
 * Vì code dùng `const Wave_Manager = {...}` (block-scope), khi eval() trong Node
 * thì biến KHÔNG tự động leak ra global. Helper này append một dòng
 * `global.<name> = <name>` vào nguồn trước khi eval để expose ra cho test dùng.
 */
const fs = require('fs');
const path = require('path');

function loadSource(relPath, globalsToExpose = []) {
    const filePath = path.join(__dirname, '..', '..', relPath);
    let src = fs.readFileSync(filePath, 'utf-8');

    // Append dòng expose globals ra cuối nguồn
    const exposeLines = globalsToExpose
        .map(name => `if (typeof ${name} !== 'undefined') global.${name} = ${name};`)
        .join('\n');
    src = src + '\n' + exposeLines;

    // Dùng indirect eval để chạy ở global scope (không hoàn toàn nhưng đủ tốt cho test)
    // eslint-disable-next-line no-eval
    eval.call(global, src);
}

module.exports = { loadSource };
