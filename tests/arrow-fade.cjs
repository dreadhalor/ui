const { chromium } = require('playwright-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`)
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(process.env.DEMO_URL ?? 'http://localhost:5199/')
    await page.click('[data-testid="tile-0"]'); await sleep(500)
    // Sample every frame for 700ms after a double-click; return the trace.
    const trace = async () => {
      const p = page.evaluate(() => new Promise((res) => {
        const b = document.querySelector('button[aria-label="Next"]'); const log = []; const t0 = performance.now()
        const tick = () => { log.push({ t: performance.now() - t0, d: b.disabled, o: +getComputedStyle(b).opacity }); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(log) }
        requestAnimationFrame(tick)
      }))
      await page.mouse.dblclick(640, 400)
      return p
    }
    let log = await trace()
    const firstDisabled = log.find((r) => r.d)
    const fading = log.filter((r) => r.d && r.o > 0 && r.o < 1)
    ok('disabled before it finishes fading', firstDisabled && firstDisabled.o > 0.5, `first disabled frame opacity=${firstDisabled?.o}`)
    ok('passes through partial opacity (a fade, not a cut)', fading.length > 0, `${fading.length} partial frames`)
    ok('ends at 0, disabled', log.at(-1).d && log.at(-1).o === 0)
    log = await trace()
    const back = log.filter((r) => r.o > 0 && r.o < 1)
    ok('fades back in on reset', back.length > 0, `${back.length} partial frames`)
    ok('ends enabled at 1', !log.at(-1).d && log.at(-1).o === 1)
  } finally { await browser.close() }
})()
