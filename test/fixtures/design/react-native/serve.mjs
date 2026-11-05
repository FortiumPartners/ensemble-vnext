// Dev server: esbuild bundles src/main.jsx with no Babel step. NativeWind 4 needs only the
// JSX import source 'nativewind' plus the compiled Tailwind CSS (public/app.css); react-native
// is aliased to react-native-web.
import { context } from 'esbuild';

const ctx = await context({
  entryPoints: { app: 'src/main.jsx' },
  bundle: true,
  outdir: 'public',
  jsx: 'automatic',
  jsxImportSource: 'nativewind',
  loader: { '.js': 'jsx' },
  alias: { 'react-native': 'react-native-web' },
  define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'true' },
});
const { port } = await ctx.serve({ servedir: 'public', port: 3200, fallback: 'public/index.html' });
console.log(`react-native fixture on http://localhost:${port}  (routes: /, /detail)`);
