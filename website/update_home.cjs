const fs = require('fs');
let content = fs.readFileSync('website/src/pages/Home.tsx', 'utf8');

const regex = /<Fingerprint className="text-emerald-400" size=\{32\} \/>[\s\S]*?<span className="text-2xl font-bold tracking-tight text-white">BioPay<\/span>/;
content = content.replace(regex, '<img src="/logo-main.png" alt="MiliPay" className="h-8 md:h-10 object-contain" />');

content = content.replace(/BioPay/g, 'MiliPay');

fs.writeFileSync('website/src/pages/Home.tsx', content, 'utf8');
console.log('Home.tsx updated');
