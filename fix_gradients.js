const fs = require('fs');

const fixGradient = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace any top-level background LinearGradients
  content = content.replace(/<LinearGradient colors=\{\['rgba?.*?'\]\} className="absolute inset-0" \/>/g, '<LinearGradient colors={isDark ? [\'rgba(16, 185, 129, 0.05)\', \'#000\'] : [\'rgba(16, 185, 129, 0.05)\', \'#f8fafc\']} className="absolute inset-0" />');
  
  content = content.replace(/<LinearGradient colors=\{\['#000', 'rgba\(16, 185, 129, 0.05\)'\]\} className="absolute inset-0" \/>/g, '<LinearGradient colors={isDark ? [\'rgba(16, 185, 129, 0.08)\', \'#000\'] : [\'rgba(16, 185, 129, 0.08)\', \'#f8fafc\']} className="absolute inset-0" />');

  // Specific fix for ExploreScreen and SettingsScreen if they already had a ternary
  content = content.replace(/<LinearGradient colors=\{isDark \? \['rgba\(16, 185, 129, 0.0[45]\)', '#000'\] : \['rgba\(16, 185, 129, 0.05\)', '#f8fafc'\]\} className="absolute inset-0" \/>/g, '<LinearGradient colors={isDark ? [\'rgba(16, 185, 129, 0.08)\', \'#000\'] : [\'rgba(16, 185, 129, 0.08)\', \'#f8fafc\']} className="absolute inset-0" />');

  fs.writeFileSync(filePath, content, 'utf8');
}

['HomeScreen.tsx', 'ProfileSettingsScreen.tsx', 'ServicesScreen.tsx', 'TransactionsScreen.tsx', 'ExploreScreen.tsx', 'SettingsScreen.tsx'].forEach(f => {
  fixGradient('mobile-app/src/screens/main/' + f);
});
