import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * A stand-in upload server for the demo and tests/upload.cjs. The file NAME decides the answer:
 * "fail" → a JSON error, "toobig" → an HTML 413 (what Cloudflare's tunnel sends), "flaky" → fails
 * the first time, "slow" → answers after 1.5s (the processing phase). It also tracks how many
 * uploads are in flight at once (GET /demo-upload/stats), so concurrency can be checked.
 */
function demoUploadServer(): Plugin {
  let inFlight = 0
  let maxInFlight = 0
  const flakySeen = new Set<string>()
  return {
    name: 'demo-upload-server',
    configureServer(server) {
      server.middlewares.use('/demo-upload', (req, res) => {
        if (req.method === 'GET') {
          if (req.url?.includes('reset')) {
            maxInFlight = 0
            flakySeen.clear()
          }
          res.setHeader('content-type', 'application/json')
          return res.end(JSON.stringify({ maxInFlight }))
        }
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        // Counted down when the connection closes, answered or not: a cancelled upload never ends.
        res.on('close', () => {
          inFlight--
        })
        const name = decodeURIComponent(String(req.headers['x-file-name'] ?? ''))
        let bytes = 0
        req.on('data', (c: Buffer) => {
          bytes += c.length
        })
        req.on('end', () => {
          const reply = () => {
            if (name.includes('toobig')) {
              res.statusCode = 413
              res.setHeader('content-type', 'text/html')
              return res.end('<html><body><h1>413 Request Entity Too Large</h1></body></html>')
            }
            if (name.includes('fail') || (name.includes('flaky') && !flakySeen.has(name))) {
              flakySeen.add(name)
              res.statusCode = 422
              res.setHeader('content-type', 'application/json')
              return res.end(JSON.stringify({ error: `The server refused ${name}.` }))
            }
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, name, bytes }))
          }
          setTimeout(reply, name.includes('slow') ? 1500 : 300)
        })
      })
    },
  }
}

// `pnpm demo` serves the gallery page in demo/ - every component, live.
export default defineConfig({ root: 'demo', plugins: [react(), tailwindcss(), demoUploadServer()] })
