import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, mode }) => {
  // A production bundle without an API URL would silently call 127.0.0.1 from visitors' phones.
  if (command === 'build' && mode === 'production' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL) {
    throw new Error('Set VITE_API_URL (e.g. https://api.bilhanah.com) to build for production.');
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
