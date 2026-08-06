import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  // 版本号注入：界面右上角/设置中显示，方便用户确认是否已更新
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // 相对路径：保证打包后 Electron(file://) 可加载
  base: './',
  server: {
    port: 5177,
    host: true,
  },
})
