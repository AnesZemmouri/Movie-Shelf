import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/**
 * Serves `.poster_cache/` at `/poster-cache/` so the mockup's WebGL renderer can
 * upload poster art to a texture.
 *
 * The remote Letterboxd URLs cannot be used for that: the CDN returns no
 * Access-Control-Allow-Origin, so an <img> loaded from it taints the canvas and
 * texImage2D throws. Same-origin bytes sidestep the whole problem. Only runs
 * under the dev server — a production build falls back to the procedural cover
 * art drawn in WebglKeepcase.tsx.
 */
function posterCache(): Plugin {
  const dir = entry('./.poster_cache')
  return {
    name: 'movieshelf:poster-cache',
    configureServer(server) {
      server.middlewares.use('/poster-cache', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        // basename() collapses any ../ in the request onto a single segment,
        // and the prefix check rejects anything that still escapes the folder.
        const name = path.basename(decodeURIComponent(req.url ?? '').split('?')[0])
        const file = path.join(dir, name)
        if (!name || !file.startsWith(dir) || !fs.existsSync(file)) return next()

        res.setHeader('Content-Type', 'image/jpeg')
        res.setHeader('Cache-Control', 'public, max-age=3600')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), posterCache()],
  build: {
    rollupOptions: {
      input: {
        // The archive itself.
        main: entry('./index.html'),
        // Standalone keepcase study. Not linked from the archive — open
        // /mockup.html directly. Delete this entry, mockup.html and src/mockup/
        // to remove the whole thing.
        mockup: entry('./mockup.html'),
      },
    },
  },
})
