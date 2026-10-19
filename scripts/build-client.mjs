import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

await build({
  entryPoints: [path.join(rootDir, 'src', 'app.jsx')],
  outfile: path.join(rootDir, 'app.bundle.js'),
  bundle: false,
  format: 'iife',
  target: ['es2019'],
  minify: true,
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  legalComments: 'none'
});

console.log('Built app.bundle.js');

// React and the fonts are served from /vendor instead of unpkg / Google Fonts so the app
// loads on localhost with no internet. vendor/ is committed like tailwind.css, so a
// production install without devDependencies keeps serving the last copied files.
const vendorDir = path.join(rootDir, 'vendor');
const vendorFontsDir = path.join(vendorDir, 'fonts');
await fs.mkdir(vendorFontsDir, { recursive: true });

// The packages' "exports" maps hide umd/, so resolve each package root and copy from there.
const vendorScripts = [
  ['react', 'react.production.min.js'],
  ['react-dom', 'react-dom.production.min.js']
];
for (const [pkg, fileName] of vendorScripts) {
  const pkgDir = path.dirname(require.resolve(pkg));
  await fs.copyFile(path.join(pkgDir, 'umd', fileName), path.join(vendorDir, fileName));
}

const LATIN_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT_RANGE = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const vendorFonts = [
  { family: 'Inter', pkg: '@fontsource-variable/inter', prefix: 'inter' },
  { family: 'JetBrains Mono', pkg: '@fontsource-variable/jetbrains-mono', prefix: 'jetbrains-mono' }
];
const fontFaces = [];
try {
  for (const font of vendorFonts) {
    const filesDir = path.join(path.dirname(require.resolve(`${font.pkg}/package.json`)), 'files');
    for (const [subset, range] of [['latin-ext', LATIN_EXT_RANGE], ['latin', LATIN_RANGE]]) {
      const fileName = `${font.prefix}-${subset}-wght-normal.woff2`;
      await fs.copyFile(path.join(filesDir, fileName), path.join(vendorFontsDir, fileName));
      fontFaces.push(`@font-face{font-family:'${font.family}';font-style:normal;font-display:swap;font-weight:100 900;src:url(/vendor/fonts/${fileName}) format('woff2');unicode-range:${range}}`);
    }
  }
  await fs.writeFile(path.join(vendorDir, 'fonts.css'), `${fontFaces.join('\n')}\n`);
  console.log('Copied vendor scripts and fonts');
} catch (error) {
  console.warn(`Font packages not installed; keeping existing vendor/fonts (${error.message})`);
}

// Tailwind is compiled here instead of by the in-browser Play CDN, which regenerated CSS on
// the main thread whenever new class names appeared. tailwind.css is committed, so a
// production install without devDependencies keeps serving the last built file.
const tailwindOutput = path.join(rootDir, 'tailwind.css');
let tailwindcss = null;
let postcss = null;
try {
  tailwindcss = require('tailwindcss');
  postcss = require('postcss');
} catch (_) {
  console.warn('tailwindcss not installed; keeping existing tailwind.css');
}

if (tailwindcss && postcss) {
  const result = await postcss([
    tailwindcss({
      content: [
        path.join(rootDir, 'index.html'),
        path.join(rootDir, 'src', 'app.jsx')
      ]
    })
  ]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n', { from: undefined });
  const minified = await build({
    stdin: { contents: result.css, loader: 'css' },
    write: false,
    minify: true,
    legalComments: 'none'
  });
  await fs.writeFile(tailwindOutput, minified.outputFiles[0].text);
  console.log('Built tailwind.css');
}
