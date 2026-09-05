const fs = require('fs');
let content = fs.readFileSync('website/src/pages/Home.tsx', 'utf8');
content = 'import { Suspense } from "react";\n' + content;
fs.writeFileSync('website/src/pages/Home.tsx', content, 'utf8');
