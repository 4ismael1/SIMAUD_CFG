import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// DEV ONLY: VITE_UI_MOCK=1 swaps the Supabase client for an in-memory fake to review the UI without a backend.
const uiMock = (): Plugin => ({
  name: 'simaud-ui-mock',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (!importer || importer.includes('supabase.mock')) return null;
    if (/(^|\/)lib\/supabase(\.ts)?$/.test(source)) return path.resolve(__dirname, 'src/lib/supabase.mock.ts');
    return null;
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: { proxy: { '/api': 'http://localhost:3000' } },
    plugins: [react(), tailwindcss(), ...(env.VITE_UI_MOCK === '1' ? [uiMock()] : [])],
  };
});
