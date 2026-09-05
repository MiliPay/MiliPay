const fs = require('fs');
let content = fs.readFileSync('website/src/pages/Home.tsx', 'utf8');

const regex = /<header className="px-6 py-6 flex justify-between items-center[\s\S]*?<\/header>/;
content = content.replace(regex, '');

fs.writeFileSync('website/src/pages/Home.tsx', content, 'utf8');
console.log('Removed duplicate header');
