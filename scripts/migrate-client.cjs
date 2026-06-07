const fs = require('fs');
const path = require('path');

const indexPath = path.join(process.cwd(), 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const openTag = '<script type="text/babel">';
const closeTag = '</script>';
const start = html.indexOf(openTag);
if (start < 0) throw new Error('Babel script tag not found');
const scriptStart = start + openTag.length;
const end = html.lastIndexOf(closeTag);
if (end < 0 || end <= scriptStart) throw new Error('Script closing tag not found');

const source = html.slice(scriptStart, end).replace(/^\r?\n/, '');
const srcDir = path.join(process.cwd(), 'src');
if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });
fs.writeFileSync(path.join(srcDir, 'app.jsx'), source, 'utf8');

let updated = html;
updated = updated.replace('    <!-- Babel CDN for JSX Parsing -->\n    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n', '');
updated = updated.slice(0, start) + '    <script src="/app.bundle.js"></script>\n' + html.slice(end + closeTag.length);
fs.writeFileSync(indexPath, updated, 'utf8');

console.log('Extracted JSX source to src/app.jsx and updated index.html to load /app.bundle.js');
