const fs = require('fs');

let about = fs.readFileSync('website/src/pages/About.tsx', 'utf8');
const oldLogoAbout = /<motion\.img[\s\S]*?className="h-16 mx-auto mb-10 object-contain"[\s\S]*?\/>/;
const newLogoAbout = `<motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="inline-flex justify-center items-center px-8 py-4 bg-white rounded-3xl mb-12 shadow-[0_0_40px_rgba(255,255,255,0.1)]"
        >
          <img 
            src="/logo-main.png" 
            alt="MiliPay" 
            className="h-12 md:h-16 object-contain" 
          />
        </motion.div>`;
about = about.replace(oldLogoAbout, newLogoAbout);
fs.writeFileSync('website/src/pages/About.tsx', about, 'utf8');
console.log('Fixed About logo');
