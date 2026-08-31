const fs = require('fs');

function fixMissingHook(filePath, funcName) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let regex = new RegExp('function ' + funcName + '\\s*\\(.*?\\)\\s*\\{');
    content = content.replace(regex, match => match + '\n  const { colorScheme } = useColorScheme();\n  const isDark = colorScheme !== \'light\';\n');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', funcName, 'in', filePath);
  }
}

fixMissingHook('mobile-app/src/screens/main/HomeScreen.tsx', 'HomeScreenContent');
fixMissingHook('mobile-app/src/screens/main/ExploreScreen.tsx', 'ExploreScreen');
fixMissingHook('mobile-app/src/screens/main/ExploreScreen.tsx', 'ExploreScreenContent'); // Just in case it has a subcomponent
