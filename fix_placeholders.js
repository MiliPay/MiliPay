const fs = require('fs');

const files = ['mobile-app/src/screens/main/ProfileSettingsScreen.tsx', 'mobile-app/src/screens/main/HomeScreen.tsx'];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/placeholderTextColor="rgba\(255,255,255,([0-9.]+)\)"/g, 'placeholderTextColor={isDark ? "rgba(255,255,255,$1)" : "rgba(0,0,0,$1)"}');
    fs.writeFileSync(f, content, 'utf8');
    console.log('Fixed placeholders in', f);
  }
});
