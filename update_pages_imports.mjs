import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function rewriteImports(dir) {
  walkDir(dir, (filePath) => {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let changed = false;

      if (content.includes('@/pages/')) {
        content = content.replace(/@\/pages\//g, '@biopay/shared/pages/');
        changed = true;
      }
      if (content.includes('@/features/')) {
        content = content.replace(/@\/features\//g, '@biopay/shared/features/');
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
      }
    }
  });
}

rewriteImports('./AdminPanel/src');
rewriteImports('./agent-portal/src');
rewriteImports('./service-portal/src');
rewriteImports('./packages/shared/src');
