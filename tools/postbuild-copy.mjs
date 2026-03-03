import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

const entriesToCopy = [
  'dashboard.html',
  'admin.html',
  'app.html',
  'index-react.html',
  'css',
  'js',
  'assets',
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(dist, { recursive: true });

  for (const rel of entriesToCopy) {
    const src = path.join(root, rel);
    const dst = path.join(dist, rel);
    if (!(await exists(src))) continue;
    await cp(src, dst, { recursive: true, force: true });
    console.log(`[postbuild] copied ${rel}`);
  }
}

main().catch((err) => {
  console.error('[postbuild] failed:', err);
  process.exit(1);
});
