const fs = require('fs');

// 1. Navbar
let nav = fs.readFileSync('website/src/components/layout/Navbar.tsx', 'utf8');
const badLogoNav = /<Link to="\/" className="flex items-center justify-center px-4 py-2 bg-white rounded-2xl shadow-\[0_0_20px_rgba\(255,255,255,0\.15\)\] hover:shadow-\[0_0_30px_rgba\(255,255,255,0\.25\)\] transition-shadow">[\s\S]*?<\/Link>/;
const origLogoNav = `<Link to="/" className="flex items-center group relative h-12 w-32 -ml-2">
          <img src="/logo-main.png" alt="MiliPay Logo" className="absolute top-1/2 -translate-y-1/2 left-0 h-28 w-auto object-contain scale-125 origin-left" />
        </Link>`;
nav = nav.replace(badLogoNav, origLogoNav);
fs.writeFileSync('website/src/components/layout/Navbar.tsx', nav, 'utf8');

// 2. Footer
let footer = fs.readFileSync('website/src/components/layout/Footer.tsx', 'utf8');
const badLogoFooter = /<Link to="\/" className="inline-flex items-center justify-center px-5 py-3 mb-6 bg-white rounded-2xl shadow-\[0_0_20px_rgba\(255,255,255,0\.1\)\] hover:shadow-\[0_0_30px_rgba\(255,255,255,0\.2\)\] transition-shadow">[\s\S]*?<\/Link>/;
const origLogoFooter = `<Link to="/" className="flex items-center group mb-4 relative h-12 w-32 -ml-2">
              <img src="/logo-main.png" alt="MiliPay Logo" className="absolute top-1/2 -translate-y-1/2 left-0 h-28 w-auto object-contain scale-125 origin-left" />
            </Link>`;
footer = footer.replace(badLogoFooter, origLogoFooter);
fs.writeFileSync('website/src/components/layout/Footer.tsx', footer, 'utf8');

// 3. About
let about = fs.readFileSync('website/src/pages/About.tsx', 'utf8');
const badLogoAbout = /<motion.div[\s\S]*?className="inline-flex justify-center items-center px-8 py-4 bg-white rounded-3xl mb-12 shadow-\[0_0_40px_rgba\(255,255,255,0\.1\)\]"[\s\S]*?<\/motion.div>/;
const origLogoAbout = `<div className="relative h-16 w-48 mx-auto mb-10">
          <motion.img 
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            src="/logo-main.png" 
            alt="MiliPay" 
            className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 h-32 w-auto object-contain scale-125" 
          />
        </div>`;
about = about.replace(badLogoAbout, origLogoAbout);
fs.writeFileSync('website/src/pages/About.tsx', about, 'utf8');

console.log('Restored original logo implementations');
