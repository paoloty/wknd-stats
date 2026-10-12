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
