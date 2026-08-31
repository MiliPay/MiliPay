const fs = require('fs');
let content = fs.readFileSync('mobile-app/src/screens/main/SettingsScreen.tsx', 'utf8');

const modalStart = '{/* Crazy Centered Theme Modal */}';
const modalEnd = '</Modal>';

const startIndex = content.indexOf(modalStart);
const endIndex = content.indexOf(modalEnd, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find modal bounds');
    process.exit(1);
}

const themedModal = `{/* Crazy Centered Theme Modal */}
      <Modal
        visible={isThemeModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsThemeModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center px-4">
          {/* Deep Blur Background */}
          <Pressable 
            className="absolute inset-0" 
            onPress={() => setIsThemeModalVisible(false)}
          >
            <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} className="absolute inset-0" />
            <View className={\`absolute inset-0 \${isDark ? 'bg-black/40' : 'bg-black/10'}\`} />
          </Pressable>

          {/* The Crazy Card */}
          <View className={\`w-full rounded-[40px] overflow-hidden border \${isDark ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200'} shadow-[0_0_40px_rgba(0,0,0,0.15)]\`}>
            <LinearGradient 
              colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(16,185,129,0.03)', 'rgba(255,255,255,0)']} 
              className="absolute inset-0" 
            />
            
            <View className="p-8 pb-10">
              <View className="flex-row items-center justify-between mb-8">
                <View>
                  <Text className="text-slate-900 dark:text-white font-inter-bold text-3xl tracking-tight mb-1">Appearance</Text>
                  <Text className="text-slate-500 dark:text-white/50 font-inter text-sm">Choose your MiliPay aesthetic.</Text>
                </View>
                <Pressable 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIsThemeModalVisible(false);
                  }}
                  className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 items-center justify-center border border-slate-200 dark:border-white/10"
                  style={({pressed}) => ({ transform: [{scale: pressed ? 0.9 : 1}] })}
                >
                  <X color={isDark ? '#fff' : '#000'} size={20} />
                </Pressable>
              </View>

              {/* System Option - Full Width */}
              <Pressable 
                onPress={() => {
                  Haptics.selectionAsync();
                  setColorScheme('system'); setActiveTheme('system');
                }}
                style={({pressed}) => ({ transform: [{scale: pressed ? 0.97 : 1}] })}
                className={\`w-full h-24 rounded-3xl mb-4 overflow-hidden border-2 \${activeTheme === 'system' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5'}\`}
              >
                <LinearGradient colors={isDark ? ['#6366f1', '#a855f7'] : ['rgba(99,102,241,0.1)', 'rgba(168,85,247,0.1)']} start={{x:0,y:0}} end={{x:1,y:1}} className="absolute inset-0 opacity-20" />
                <View className="flex-1 flex-row items-center px-6">
                  <View className={\`w-12 h-12 rounded-2xl items-center justify-center mr-4 \${activeTheme === 'system' ? 'bg-emerald-500/20' : 'bg-slate-200 dark:bg-white/10'}\`}>
                    <Smartphone color={activeTheme === 'system' ? '#10b981' : (isDark ? '#fff' : '#000')} size={24} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-lg mb-0.5">System Match</Text>
                    <Text className="text-slate-500 dark:text-white/50 font-inter text-xs">Adapts to your device</Text>
                  </View>
                  {activeTheme === 'system' && (
                    <View className="w-8 h-8 rounded-full bg-emerald-500 items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                      <Check color="#fff" size={16} />
                    </View>
                  )}
                </View>
              </Pressable>

              {/* Light & Dark - Side by Side Grid */}
              <View className="flex-row justify-between h-40">
                
                {/* Light Option */}
                <Pressable 
                  onPress={() => {
                    Haptics.selectionAsync();
                    setColorScheme('light'); setActiveTheme('light');
                  }}
                  style={({pressed}) => ({ transform: [{scale: pressed ? 0.95 : 1}] })}
                  className={\`w-[48%] h-full rounded-3xl overflow-hidden border-2 p-4 justify-between \${activeTheme === 'light' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5'}\`}
                >
                  <LinearGradient colors={['rgba(253,251,251,0.5)', 'rgba(235,237,238,0.5)']} className="absolute inset-0" />
                  <View className="flex-row items-start justify-between">
                    <View className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 items-center justify-center">
                      <Sun color="#f59e0b" size={24} fill="#f59e0b" />
                    </View>
                    {activeTheme === 'light' && (
                      <View className="w-6 h-6 rounded-full bg-emerald-500 items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                        <Check color="#fff" size={12} />
                      </View>
                    )}
                  </View>
                  <View>
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">Light</Text>
                    <Text className="text-slate-500 dark:text-white/50 font-inter text-xs mt-1">Clean & bright</Text>
                  </View>
                </Pressable>

                {/* Dark Option */}
                <Pressable 
                  onPress={() => {
                    Haptics.selectionAsync();
                    setColorScheme('dark'); setActiveTheme('dark');
                  }}
                  style={({pressed}) => ({ transform: [{scale: pressed ? 0.95 : 1}] })}
                  className={\`w-[48%] h-full rounded-3xl overflow-hidden border-2 p-4 justify-between \${activeTheme === 'dark' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/5 bg-[#020617]'}\`}
                >
                  <LinearGradient colors={['rgba(15,23,42,0.8)', 'rgba(2,6,23,0.8)']} className="absolute inset-0" />
                  <View className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
                  <View className="flex-row items-start justify-between">
                    <View className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 items-center justify-center">
                      <Moon color="#3b82f6" size={24} fill="#3b82f6" />
                    </View>
                    {activeTheme === 'dark' && (
                      <View className="w-6 h-6 rounded-full bg-emerald-500 items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                        <Check color="#fff" size={12} />
                      </View>
                    )}
                  </View>
                  <View>
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">Dark</Text>
                    <Text className="text-slate-500 dark:text-white/50 font-inter text-xs mt-1">Sleek & deep</Text>
                  </View>
                </Pressable>

              </View>

            </View>
          </View>
        </View>
      </Modal>`;

const newContent = content.slice(0, startIndex) + themedModal + content.slice(endIndex + modalEnd.length);

fs.writeFileSync('mobile-app/src/screens/main/SettingsScreen.tsx', newContent, 'utf8');
console.log('Themed modal updated!');
