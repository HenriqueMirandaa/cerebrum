import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'
  const devApiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3001'

  return {
    plugins: [react()],
    base,
    server: {
      port: 5173,
      strictPort: false,
      open: true,
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/api')
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'esnext',
      minify: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'router': ['react-router-dom']
          }
        }
      }
    },
  }
})
