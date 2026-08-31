const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix the broken replacements
  content = content.replace(/text-slate-500 dark:text-white\/(?=\s)/g, 'text-slate-500 dark:text-white/60');
  content = content.replace(/bg-slate-200 dark:bg-black\/(?=\s)/g, 'bg-slate-200 dark:bg-black/40');
  content = content.replace(/border-slate-200 dark:border-white\/(?=\s)/g, 'border-slate-200 dark:border-white/10');
  content = content.replace(/bg-black\/5 dark:bg-white\/(?=\s)/g, 'bg-black/5 dark:bg-white/10');
  
  // Also, fix any remaining ones that might have had different opacities. 
  // It's safer to just revert and do it properly if needed, but since it ate the numbers, 
  // the ones that are broken look like "text-white/ ". Let's fix them manually.
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed', filePath);
}

const files = [
  'mobile-app/src/screens/main/HomeScreen.tsx',
  'mobile-app/src/screens/main/ExploreScreen.tsx',
  'mobile-app/src/screens/main/TransactionsScreen.tsx',
  'mobile-app/src/screens/main/ProfileSettingsScreen.tsx',
  'mobile-app/src/screens/main/ServicesScreen.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    processFile(f);
  }
});
