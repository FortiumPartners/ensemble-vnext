/** NativeWind 4 pairs with Tailwind 3.x: the preset adds the native-aware utilities. */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: { colors: { accent: '#c8362a', ink: '#1b1f2a' } } },
};
