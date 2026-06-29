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
    // 使用 esbuild 进行 JS 压缩（更快更小）
    minify: 'esbuild',
    // 启用源码映射有助于调试，生产环境可关闭
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
