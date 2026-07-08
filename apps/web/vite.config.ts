import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Custom plugin to show helpful dev server messages
const devServerMessages = () => ({
  name: 'dev-server-messages',
  configureServer(server: any) {
    // Show message when server starts
    console.log('\n🚀 Web App Development Server');
    console.log(
      '📍 Primary URL: http://app.lvh.me:5173 (for proper cookie handling)',
    );
    console.log(
      '📍 Alternative: http://localhost:5173 (if hosts not configured)',
    );
    console.log('💡 To enable app.lvh.me add to /etc/hosts');
    console.log('💡 Or just start local staging and run in docker');
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env['NODE_ENV'] ?? 'development';
const isDev = env === 'development' || env === 'local';
const isStaging = env === 'staging';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
    // Only add dev server messages in development
    ...(isDev ? [devServerMessages()] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@session': path.resolve(__dirname, 'src/app/session'),
    },
  },

  server: {
    // Listen on all interfaces to support both localhost and lvh.me
    // For proper cookie handling, add to /etc/hosts: 127.0.0.1 app.lvh.me
    // Then access via: http://app.lvh.me:5173
    host: isDev ? 'app.lvh.me' : true, // Use app.lvh.me in dev, all interfaces in staging
    port: isStaging ? 3000 : 5173,
    allowedHosts: ['localhost', 'lvh.me', '.lvh.me'],
  },
});
