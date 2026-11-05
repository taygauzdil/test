// Builds a single self-contained HTML file (no server needed): gladiator-backpack.html
// Usage: node build-standalone.mjs   (requires network once for `npx esbuild`)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const js = execSync('npx -y esbuild@0.24.0 src/main.js --bundle --format=esm --minify --target=es2020', { maxBuffer: 64 << 20 }).toString();
const css = readFileSync('style.css', 'utf8');
let html = readFileSync('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="src/main.js"></script>', () => `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
writeFileSync('gladiator-backpack.html', html);
console.log('wrote gladiator-backpack.html', (html.length / 1024).toFixed(0) + ' KB');
