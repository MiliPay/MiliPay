const fs = require('fs');
let content = fs.readFileSync('mobile-app/src/screens/main/SettingsScreen.tsx', 'utf8');

// 1. Add Modal to react-native imports
content = content.replace(/import \{ View, Text, ScrollView, Pressable, Switch, Alert \} from 'react-native';/, "import { View, Text, ScrollView, Pressable, Switch, Alert, Modal } from 'react-native';");

// 2. Add BlurView
content = content.replace(/import \{ LinearGradient \} from 'expo-linear-gradient';/, "import { LinearGradient } from 'expo-linear-gradient';\nimport { BlurView } from 'expo-blur';");

// 3. Add icons
content = content.replace(/Palette,/, 'Palette, Sun, Moon, Smartphone, Check,');

// 4. State
content = content.replace(/const \[notificationsEnabled, setNotificationsEnabled\] = useState\(true\);/, "const [notificationsEnabled, setNotificationsEnabled] = useState(true);\n  const [isThemeModalVisible, setIsThemeModalVisible] = useState(false);");

// 5. Replace handleThemeChange
const oldHandleTheme = `  const handleThemeChange = () => {
    Alert.alert(
      "Appearance",
      "Select your preferred theme",
      [
        { text: "Dark", onPress: () => setColorScheme("dark") },
        { text: "Light", onPress: () => setColorScheme("light") },
        { text: "System", onPress: () => setColorScheme("system") },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };`;
  
const newHandleTheme = `  const handleThemeChange = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsThemeModalVisible(true);
  };`;

content = content.replace(oldHandleTheme, newHandleTheme);

// 6. Change 'Appearance' to 'Theme'
content = content.replace(/label="Appearance"/g, 'label="Theme"');

// 7. Inject the Modal before closing </SafeAreaView>
const themeModalCode = `
      {/* Theme Modal */}
      <Modal
        visible={isThemeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsThemeModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/20 dark:bg-black/60">
          <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} className="absolute inset-0" />
          <View className="bg-white dark:bg-[#111827] rounded-t-3xl pt-2 px-6 pb-12 min-h-[40%] border-t border-slate-200 dark:border-white/10 shadow-2xl">
            {/* Grab Handle */}
            <View className="items-center mb-6">
              <View className="w-12 h-1.5 bg-black/10 dark:bg-white/10 rounded-full" />
            </View>

            <Text className="text-slate-900 dark:text-white font-inter-bold text-xl mb-6">Choose Theme</Text>

            <View className="space-y-3">
              {[ 
                { id: 'system', label: 'System Default', icon: Smartphone },
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon }
              ].map((theme) => {
                const Icon = theme.icon;
                const isSelected = colorScheme === theme.id;
                return (
                  <Pressable 
                    key={theme.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setColorScheme(theme.id);
                      setIsThemeModalVisible(false);
                    }}
                    className={\`flex-row items-center justify-between p-4 rounded-2xl border mb-3 \${isSelected ? 'border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/10 bg-black/5 dark:bg-white/5'}\`}
                  >
                    <View className="flex-row items-center">
                      <Icon color={isSelected ? '#10b981' : (isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)')} size={20} />
                      <Text className={\`font-inter-medium text-base ml-3 \${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-white/80'}\`}>
                        {theme.label}
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="w-6 h-6 rounded-full bg-emerald-500/20 items-center justify-center">
                        <Check color="#10b981" size={14} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>`;

content = content.replace(/<\/SafeAreaView>/, themeModalCode);

fs.writeFileSync('mobile-app/src/screens/main/SettingsScreen.tsx', content, 'utf8');
console.log('SettingsScreen updated with custom Theme Modal!');
