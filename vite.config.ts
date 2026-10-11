import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `pnpm demo` serves the gallery page in demo/ - every component, live.
export default defineConfig({ root: 'demo', plugins: [react(), tailwindcss()] })
