import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 启用 CSS 压缩
    cssMinify: true,
    // 使用 terser 进行 JS 压缩，并剥离 console / debugger（生产环境不泄露调试信息）
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      format: {
        comments: false,
      },
    },
    // 生产环境关闭源码映射
    sourcemap: false,
    rollupOptions: {
      output: {
        // 将 Vue 单独分包，利用缓存和并行加载
        manualChunks: {
          'vue': ['vue'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
