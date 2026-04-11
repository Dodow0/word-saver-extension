import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    // 构建完成后，把 manifest.json 复制到 dist 根目录
    {
      name: 'copy-manifest',
      closeBundle() {
        try {
          mkdirSync('dist/icons', { recursive: true })
          copyFileSync('public/manifest.json', 'dist/manifest.json')
          console.log('✅ manifest.json copied to dist/')
        } catch (e) {
          console.error('❌ Failed to copy manifest:', e)
        }
      }
    }
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false, // 发布时关闭，开发时可改为 true

    rollupOptions: {
      input: {
        // 每个入口对应插件的一个页面或脚本
        popup:      resolve(__dirname, 'popup.html'),
        options:    resolve(__dirname, 'options.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content:    resolve(__dirname, 'src/content/index.ts'),
      },

      output: {
        // Service Worker 和 Content Script 必须是单文件，不能被分包
        entryFileNames: (chunkInfo) => {
          if (['background', 'content'].includes(chunkInfo.name)) {
            return '[name].js'           // → dist/background.js, dist/content.js
          }
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // content.css 保持固定名称，因为 manifest 里写死了
          if (assetInfo.name === 'content.css') return 'content.css'
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
