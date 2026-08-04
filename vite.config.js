import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 相对路径：保证打包后 Electron(file://) 可加载
  base: './',
  server: {
    port: 5177,
    host: true,
  },
})
