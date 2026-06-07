import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
