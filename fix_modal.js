const fs = require('fs');
let content = fs.readFileSync('mobile-app/src/screens/main/HomeScreen.tsx', 'utf8');

const brokenPart = '             <ArrowDownLeft color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={24} />\n           </View>\n              <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">All Services</Text>';

const fixedPart = `             <ArrowDownLeft color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={24} />
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
              <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">All Services</Text>`;

content = content.replace(brokenPart, fixedPart);
fs.writeFileSync('mobile-app/src/screens/main/HomeScreen.tsx', content, 'utf8');
console.log('Fixed Modal markup!');
