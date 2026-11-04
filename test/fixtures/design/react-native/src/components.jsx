// Two small React Native components styled with NativeWind 4 classes.
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export function PriorityChip({ label }) {
  return (
    <View className="rounded-full bg-accent px-2 py-1">
      <Text className="text-xs font-semibold text-white">{label}</Text>
    </View>
  );
}

export function TripRow({ title, priority, onPress }) {
  return (
    <Pressable onPress={onPress} className="min-h-[44px] flex-row items-center justify-between border-b border-slate-200 px-4 py-3">
      <Text className="text-base text-ink">{title}</Text>
      <PriorityChip label={priority} />
    </Pressable>
  );
}
