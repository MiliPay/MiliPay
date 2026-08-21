import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
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

      // Replace @/components/ui with @milipay/shared/components/ui
      if (content.includes('@/components/ui')) {
        content = content.replace(/@\/components\/ui/g, '@milipay/shared/components/ui');
        changed = true;
      }
      // Replace @/components/layout with @milipay/shared/components/layout
      if (content.includes('@/components/layout')) {
        content = content.replace(/@\/components\/layout/g, '@milipay/shared/components/layout');
        changed = true;
      }
      // Replace @/lib with @milipay/shared/lib
      if (content.includes('@/lib/')) {
        content = content.replace(/@\/lib\//g, '@milipay/shared/lib/');
        changed = true;
      }
      // Replace @/types with @milipay/shared/types
      if (content.includes('@/types')) {
        content = content.replace(/@\/types/g, '@milipay/shared/types');
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
      }
    }
  });
}

rewriteImports('./service-portal/src');
