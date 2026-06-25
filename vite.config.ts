import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Адрес бэкенда для dev-режима задаётся в src/api/client.ts (API_HOST).
// Если C++ REST не отдаёт CORS-заголовки, используйте прокси ниже:
//   1) поставьте API_HOST = '' в client.ts
//   2) раскомментируйте server.proxy и укажите тот же IP
const DEV_BACKEND = 'http://192.168.1.50';

export default defineConfig({
  plugins: [react()],
  // server: {
  //   proxy: {
  //     '/neural': { target: DEV_BACKEND, changeOrigin: true },
  //   },
  // },
});
