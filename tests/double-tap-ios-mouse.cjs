const { chromium } = require('playwright-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`)
  try {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
    async function tap(x, y, down, drift) { await touch('touchStart', [[x, y]]); await sleep(down / 2); await touch('touchMove', [[x + drift, y + drift / 2]]); await sleep(down / 2); await touch('touchEnd', []); const liftedAt = Date.now(); await sleep(20); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); return liftedAt }
    async function dbl(down, gap, drift) { const lifted = await tap(196, 400, down, drift); await sleep(Math.max(0, gap - (Date.now() - lifted))); await tap(198, 403, down, drift); await sleep(650) }
    const scale = () => page.evaluate(() => { const c = document.querySelector('[data-index="0"] .react-transform-component'); const m = getComputedStyle(c).transform; return m === 'none' ? 1 : +new DOMMatrix(m).a.toFixed(2) })
    await page.goto(process.env.DEMO_URL ?? 'http://localhost:5199/')
    await page.tap('[data-testid="tile-0"]'); await sleep(500)
    for (const [down, gap, drift] of [[60, 80, 0], [100, 150, 3], [120, 220, 6], [90, 120, 4], [140, 250, 2], [80, 100, 5]]) {
      const before = await scale()
      await dbl(down, gap, drift)
      const after = await scale()
      const want = before > 1.01 ? 'out' : 'in'
      ok(`double-tap ${want} (down ${down}ms, gap ${gap}ms, drift ${drift}px)`, want === 'in' ? after > 2 : after < 1.01, `${before} -> ${after}`)
    }
    const s0 = await scale()
    await tap(196, 400, 90, 2); await sleep(450); await tap(196, 400, 90, 2); await sleep(650)
    ok('two slow taps do nothing', (await scale()) === s0, `${s0} -> ${await scale()}`)
    await tap(196, 400, 90, 2); await sleep(650)
    ok('single tap does nothing', (await scale()) === s0)
  } finally { await browser.close() }
})()
