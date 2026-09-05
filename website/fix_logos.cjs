const fs = require('fs');

// 1. Navbar
let nav = fs.readFileSync('website/src/components/layout/Navbar.tsx', 'utf8');
const oldLogoNav = /<Link to="\/" className="flex items-center group relative h-10 w-32 -ml-2">[\s\S]*?<\/Link>/;
const newLogoNav = `<Link to="/" className="flex items-center justify-center px-4 py-2 bg-white rounded-2xl shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] transition-shadow">
          <img src="/logo-main.png" alt="MiliPay Logo" className="h-8 md:h-10 w-auto object-contain" />
        </Link>`;
nav = nav.replace(oldLogoNav, newLogoNav);
fs.writeFileSync('website/src/components/layout/Navbar.tsx', nav, 'utf8');

// 2. Footer
let footer = fs.readFileSync('website/src/components/layout/Footer.tsx', 'utf8');
const oldLogoFooter = /<Link to="\/" className="flex items-center group mb-4 relative h-10 w-32 -ml-2">[\s\S]*?<\/Link>/;
const newLogoFooter = `<Link to="/" className="inline-flex items-center justify-center px-5 py-3 mb-6 bg-white rounded-2xl shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-shadow">
              <img src="/logo-main.png" alt="MiliPay Logo" className="h-10 w-auto object-contain" />
            </Link>`;
footer = footer.replace(oldLogoFooter, newLogoFooter);
fs.writeFileSync('website/src/components/layout/Footer.tsx', footer, 'utf8');
console.log('Fixed logos in Navbar and Footer');
