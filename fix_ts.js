const fs = require('fs');
let content = fs.readFileSync('mobile-app/src/screens/main/SettingsScreen.tsx', 'utf8');

content = content.replace(/const \[isThemeModalVisible, setIsThemeModalVisible\] = useState\(false\);/, "const [isThemeModalVisible, setIsThemeModalVisible] = useState(false);\n  const [activeTheme, setActiveTheme] = useState('system');");

content = content.replace(/setColorScheme\('system'\);/g, "setColorScheme('system'); setActiveTheme('system');");
content = content.replace(/setColorScheme\('light'\);/g, "setColorScheme('light'); setActiveTheme('light');");
content = content.replace(/setColorScheme\('dark'\);/g, "setColorScheme('dark'); setActiveTheme('dark');");

content = content.replace(/colorScheme === 'system'/g, "activeTheme === 'system'");
content = content.replace(/colorScheme === 'light'/g, "activeTheme === 'light'");
content = content.replace(/colorScheme === 'dark'/g, "activeTheme === 'dark'");

fs.writeFileSync('mobile-app/src/screens/main/SettingsScreen.tsx', content, 'utf8');
console.log('Fixed TS by adding activeTheme state');
