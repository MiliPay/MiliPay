const fs = require('fs');

function addThemeHook(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Skip if already added
  if (content.includes('useColorScheme')) return;

  // Add import
  content = content.replace(/import React(.*?);/, 'import React$1;\nimport { useColorScheme } from \'nativewind\';');

  // Add isDark to component bodies
  content = content.replace(/export default function ([A-Za-z0-9_]+)\((.*?)\) \{/g, 'export default function $1($2) {\n  const { colorScheme } = useColorScheme();\n  const isDark = colorScheme !== \'light\';\n');

  // Also add it to const BankNode = (...) => { 
  content = content.replace(/const BankNode = \((.*?)\) => \{/g, 'const BankNode = ($1) => {\n  const { colorScheme } = useColorScheme();\n  const isDark = colorScheme !== \'light\';\n');

  // E.g., color="rgba(255,255,255,0.7)" -> color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"}
  content = content.replace(/color="rgba\(255,255,255,([0-9.]+)\)"/g, 'color={isDark ? "rgba(255,255,255,$1)" : "rgba(0,0,0,$1)"}');
  
  content = content.replace(/color="#fff"/g, 'color={isDark ? "#fff" : "#000"}');
  
  content = content.replace(/colors=\{\['rgba\(16, 185, 129, 0.04\)', '#000'\]\}/g, 'colors={isDark ? [\'rgba(16, 185, 129, 0.04)\', \'#000\'] : [\'rgba(16, 185, 129, 0.05)\', \'#f8fafc\']}');

  // BlurView tint="dark"
  content = content.replace(/tint="dark"/g, 'tint={isDark ? "dark" : "light"}');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Added theme hook to', filePath);
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
    addThemeHook(f);
  }
});
