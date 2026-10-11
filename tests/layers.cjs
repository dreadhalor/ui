// Memory guard: with a LoadLab-sized strip open, count composited layers and their pixel area.
// Every slide used to carry its own GPU layer (the zoom library's translate3d), which crashed
// iPhone Safari's page process with a few hundred photos.
const { chromium } = require('playwright-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`)
  try {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    let layers = []
    let events = 0
    cdp.on('LayerTree.layerTreeDidChange', (e) => { events++; if (e.layers) layers = e.layers })
    await page.goto((process.env.DEMO_URL ?? 'http://localhost:5199/') + '?n=300')
    await page.tap('[data-testid="tile-0"]'); await sleep(1000)
    await cdp.send('LayerTree.enable')
    // Nudge a repaint so the tree is reported.
    await page.evaluate(() => { document.body.style.outline = '1px solid transparent' }); await sleep(1000)
    if (!events) console.log('FAIL no layer tree reported')
    const drawn = layers.filter((l) => l.drawsContent)
    // Count, not area: the strip's own scrolling layer reports its full 300-slide width but is tiled.
    ok('300-photo strip: few composited layers', drawn.length < 20, `${drawn.length} drawing layers`)

    // A slide that mounted far away must still zoom once you reach it.
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
    async function gesture(from, to, steps = 12) { await touch('touchStart', from); for (let s = 1; s <= steps; s++) { await touch('touchMove', from.map(([x, y], k) => [x + ((to[k][0] - x) * s) / steps, y + ((to[k][1] - y) * s) / steps])); await sleep(16) } await touch('touchEnd', []) }
    async function tap(x, y) { await touch('touchStart', [[x, y]]); await sleep(50); await touch('touchEnd', []) }
    const scale = (i) => page.evaluate((i) => { const c = document.querySelector(`[data-index="${i}"] .react-transform-component`); if (!c) return null; const m = getComputedStyle(c).transform; return m === 'none' ? 1 : +new DOMMatrix(m).a.toFixed(2) }, i)
    ok('far slide has no zoom wrapper', (await scale(7)) === null)
    for (let k = 0; k < 7; k++) { await page.keyboard.press('ArrowRight'); await sleep(450) }
    await sleep(400)
    await gesture([[180, 420], [210, 430]], [[90, 330], [300, 520]]); await sleep(500)
    ok('pinch works on a slide reached later (7)', (await scale(7)) > 1.3, `scale=${await scale(7)}`)
    await tap(196, 450); await sleep(120); await tap(196, 450); await sleep(700)
    ok('double-tap works there too', (await scale(7)) < 1.01, `scale=${await scale(7)}`)
  } finally { await browser.close() }
})()
