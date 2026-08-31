const fs = require('fs');
let content = fs.readFileSync('mobile-app/src/screens/main/HomeScreen.tsx', 'utf8');

const startStr = '<Text className="text-slate-900 dark:text-white font-inter-medium text-[11px]">View All</Text>\n          </Pressable>\n        </View>';
const startIndex = content.indexOf('<Text className="text-slate-900 dark:text-white font-inter-medium text-[11px]">View All</Text>');
if (startIndex === -1) {
    console.log('start string not found!');
    process.exit(1);
}

const endStr = '<X color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"} size={18} />';
const endIndex = content.indexOf(endStr, startIndex);
if (endIndex === -1) {
    console.log('end string not found!');
    process.exit(1);
}

const replacement = `<Text className="text-slate-900 dark:text-white font-inter-medium text-[11px]">View All</Text>
          </Pressable>
        </View>
        
        <View className="px-6 pb-12 items-center justify-center py-8">
           <View className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center mb-4">
             <ArrowDownLeft color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={24} />
           </View>
           <Text className="text-slate-500 dark:text-white/60 font-inter text-sm">No recent MiliPay transactions</Text>
        </View>
      </ScrollView>

      {/* More Services Modal */}
      <Modal
        visible={isMoreServicesVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsMoreServicesVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/20 dark:bg-black/60">
          <BlurView intensity={20} tint={isDark ? "dark" : "light"} className="absolute inset-0" />
          <View className="bg-white dark:bg-[#111827] rounded-t-3xl pt-2 px-4 pb-8 min-h-[60%] border-t border-slate-200 dark:border-white/10">
            {/* Grab Handle */}
            <View className="items-center mb-4">
              <View className="w-12 h-1.5 bg-black/5 dark:bg-white/10 rounded-full" />
            </View>
            
            <View className="flex-row items-center justify-between mb-6 px-2">
              <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">All Services</Text>
              <Pressable 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsMoreServicesVisible(false);
                }}
                className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center"
              >
                <X color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"} size={18} />`;

content = content.slice(0, startIndex) + replacement + content.slice(endIndex + endStr.length);
fs.writeFileSync('mobile-app/src/screens/main/HomeScreen.tsx', content, 'utf8');
console.log('Successfully fixed modal markup');
