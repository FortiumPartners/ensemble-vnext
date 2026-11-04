// Dev server: esbuild bundles src/main.jsx and serves public/. Unknown paths fall back to
// index.html so /trips and /settings load directly.
import { context } from 'esbuild';

const ctx = await context({
  entryPoints: { app: 'src/main.jsx' },
  bundle: true,
  outdir: 'public',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const { port } = await ctx.serve({ servedir: 'public', port: 3110, fallback: 'public/index.html' });
console.log(`react-web fixture on http://localhost:${port}  (routes: /, /trips, /settings)`);
