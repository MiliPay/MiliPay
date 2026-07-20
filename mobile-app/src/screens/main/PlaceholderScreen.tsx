import { View, Text } from 'react-native';

export default function PlaceholderScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-gray-900">
      <Text className="text-white text-2xl font-bold">Coming Soon</Text>
      <Text className="text-gray-400 mt-2 text-center px-8">We are working on exciting new features for this tab.</Text>
    </View>
  );
}
