import fs from 'fs';
import path from 'path';

const root = process.cwd();
const nextDir = path.join(root, '.next');
const standaloneDir = path.join(nextDir, 'standalone');
const tempDir = path.join(root, '.hostinger-next-build');
const repoRoot = path.resolve(root, '..', '..');
const repoOutputDir = path.join(repoRoot, '.next');
const repoTempDir = path.join(repoRoot, '.hostinger-next-build');
const publicDir = path.join(root, 'public');

function removeDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) return;
  ensureDir(path.dirname(target));
  fs.cpSync(source, target, { recursive: true });
}

if (!fs.existsSync(standaloneDir)) {
  console.error('No se encontro .next/standalone tras next build.');
  process.exit(1);
}

removeDir(tempDir);
ensureDir(tempDir);

copyDir(standaloneDir, tempDir);
copyDir(path.join(nextDir, 'static'), path.join(tempDir, '.next', 'static'));
copyDir(publicDir, path.join(tempDir, 'public'));

removeDir(nextDir);
fs.renameSync(tempDir, nextDir);

removeDir(repoTempDir);
ensureDir(repoTempDir);
copyDir(nextDir, repoTempDir);
removeDir(repoOutputDir);
fs.renameSync(repoTempDir, repoOutputDir);

console.log('Build preparado para Hostinger en apps/admin/.next y en /.next');
