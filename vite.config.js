import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Runs the evalU API (server/api.js) inside the Vite dev server,
// so `npm run dev` starts both the app and the backend.
const evaluBackend = () => ({
  name: 'evalu-backend',
  async configureServer(server) {
    const { handleApi } = await import('./server/api.js')
    server.middlewares.use(async (req, res, next) => {
      if (!(await handleApi(req, res))) next()
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), evaluBackend()],
})
