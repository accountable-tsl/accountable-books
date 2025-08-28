import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.NODE_ENV;
const isDev = env === 'development' || env === 'local';
const isStaging = env === 'staging';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  server: {
    host: true /* == 0.0.0.0 */,
    port: isStaging ? 3000 : 5173,
    allowedHosts: ['localhost', 'lvh.me', '.lvh.me'],
  },
});
