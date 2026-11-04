const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

const originalName = pkg.name;
try {
  if (originalName && originalName.startsWith('@')) {
    pkg.name = originalName.split('/')[1] || 'snapzip';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  const args = process.argv.slice(2).join(' ');
  execSync(`vsce package ${args}`, { stdio: 'inherit' });
} finally {
  fs.writeFileSync(pkgPath, raw);
}
