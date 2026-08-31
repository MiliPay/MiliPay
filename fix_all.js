const fs = require('fs');
let content = fs.readFileSync('mobile-app/src/screens/main/HomeScreen.tsx', 'utf8');

// 1. Replace text-white -> text-slate-900 dark:text-white
content = content.replace(/(?<!\w)text-white(?!\/)(?!\w)/g, 'text-slate-900 dark:text-white');

// 2. Replace text-white/XX -> text-slate-500 dark:text-white/XX
content = content.replace(/(?<!\w)text-white\/([0-9]+)(?!\w)/g, 'text-slate-500 dark:text-white/$1');

// 3. Replace bg-black -> bg-slate-50 dark:bg-black
content = content.replace(/(?<!\w)bg-black(?!\/)(?!\w)/g, 'bg-slate-50 dark:bg-black');

// 4. Replace bg-black/XX -> bg-slate-200 dark:bg-black/XX
content = content.replace(/(?<!\w)bg-black\/([0-9]+)(?!\w)/g, 'bg-slate-200 dark:bg-black/$1');

// 5. border-white/XX -> border-slate-200 dark:border-white/XX
content = content.replace(/(?<!\w)border-white\/([0-9]+)(?!\w)/g, 'border-slate-200 dark:border-white/$1');

// 6. bg-white/XX -> bg-black/5 dark:bg-white/XX
content = content.replace(/(?<!\w)bg-white\/([0-9]+)(?!\w)/g, 'bg-black/5 dark:bg-white/$1');

// 7. Inject useColorScheme
if (!content.includes('useColorScheme')) {
  content = content.replace(/import React(.*?);/, 'import React$1;\nimport { useColorScheme } from \'nativewind\';');
  content = content.replace(/export default function ([A-Za-z0-9_]+)\((.*?)\) \{/g, 'export default function $1($2) {\n  const { colorScheme } = useColorScheme();\n  const isDark = colorScheme !== \'light\';\n');
  content = content.replace(/const BankNode = \((.*?)\) => \{/g, 'const BankNode = ($1) => {\n  const { colorScheme } = useColorScheme();\n  const isDark = colorScheme !== \'light\';\n');
  content = content.replace(/function HomeScreenContent\((.*?)\) \{/g, 'function HomeScreenContent({ navigation }: any) {\n  const { colorScheme } = useColorScheme();\n  const isDark = colorScheme !== \'light\';\n');
}

// 8. Fix specific colors and tints
content = content.replace(/color="rgba\(255,255,255,([0-9.]+)\)"/g, 'color={isDark ? "rgba(255,255,255,$1)" : "rgba(0,0,0,$1)"}');
content = content.replace(/color="#fff"/g, 'color={isDark ? "#fff" : "#000"}');
content = content.replace(/tint="dark"/g, 'tint={isDark ? "dark" : "light"}');

// 9. Fix Gradients
content = content.replace(/<LinearGradient colors=\{\['rgba\(16, 185, 129, 0.04\)', '#000'\]\} className="absolute inset-0" \/>/g, '<LinearGradient colors={isDark ? [\'rgba(16, 185, 129, 0.08)\', \'#000\'] : [\'rgba(16, 185, 129, 0.08)\', \'#f8fafc\']} className="absolute inset-0" />');
// Original had '#000', 'rgba(...'
content = content.replace(/<LinearGradient colors=\{\['#000', 'rgba\(16, 185, 129, 0.05\)'\]\} className="absolute inset-0" \/>/g, '<LinearGradient colors={isDark ? [\'rgba(16, 185, 129, 0.08)\', \'#000\'] : [\'rgba(16, 185, 129, 0.08)\', \'#f8fafc\']} className="absolute inset-0" />');

// 10. Revert BankNode text to pure white (since it's on a dark colored card)
content = content.replace(/<Text className="text-slate-500 dark:text-white\/([0-9]+) font-inter-semibold uppercase tracking-widest text-xs mr-3">/g, '<Text className="text-white/$1 font-inter-semibold uppercase tracking-widest text-xs mr-3">');
content = content.replace(/<Text className="text-slate-900 dark:text-white font-inter-bold text-lg">/g, '<Text className="text-white font-inter-bold text-lg">');
content = content.replace(/<Text className="text-slate-500 dark:text-white\/([0-9]+) font-inter-semibold uppercase tracking-widest text-xs mb-1">Available Balance<\/Text>/g, '<Text className="text-white/$1 font-inter-semibold uppercase tracking-widest text-xs mb-1">Available Balance</Text>');
content = content.replace(/<Text className="text-slate-900 dark:text-white font-mono-bold text-3xl tracking-tighter">/g, '<Text className="text-white font-mono-bold text-3xl tracking-tighter">');
content = content.replace(/<Text className="text-slate-500 dark:text-white\/([0-9]+) font-inter-semibold uppercase tracking-widest text-xs mr-2">Account No:<\/Text>/g, '<Text className="text-white/$1 font-inter-semibold uppercase tracking-widest text-xs mr-2">Account No:</Text>');
content = content.replace(/<Text className="text-slate-500 dark:text-white\/([0-9]+) font-mono text-sm mr-2">\{item\.accountNumber\}<\/Text>/g, '<Text className="text-white/$1 font-mono text-sm mr-2">{item.accountNumber}</Text>');

// 11. Modal fix
content = content.replace(/<View className="flex-1 justify-end bg-slate-200 dark:bg-black\/([0-9]+)">/g, '<View className="flex-1 justify-end bg-black/20 dark:bg-black/60">');
// Also if the regex missed the opacity:
content = content.replace(/<View className="flex-1 justify-end bg-slate-200 dark:bg-black\/">/g, '<View className="flex-1 justify-end bg-black/20 dark:bg-black/60">');

fs.writeFileSync('mobile-app/src/screens/main/HomeScreen.tsx', content, 'utf8');
console.log('Restored and Fixed HomeScreen!');
