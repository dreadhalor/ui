const { chromium } = require('playwright-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const results = []
  const ok = (name, cond, extra = "") => console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`)
  try {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errors.push(m.text()))
    const cdp = await ctx.newCDPSession(page)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
    async function gesture(from, to, steps = 12, gap = 16) {
      // from/to: arrays of [x,y] per finger
      await touch('touchStart', from)
      for (let s = 1; s <= steps; s++) {
        await touch('touchMove', from.map(([x, y], k) => [x + ((to[k][0] - x) * s) / steps, y + ((to[k][1] - y) * s) / steps]))
        await sleep(gap)
      }
      await touch('touchEnd', [])
    }
    const counter = () => page.evaluate(() => [...document.querySelectorAll('span')].find((s) => /\d+ \/ \d+/.test(s.textContent))?.textContent ?? null)
    const scale = (i) => page.evaluate((i) => {
      const slide = document.querySelector(`[data-index="${i}"]`)
      const c = slide?.querySelector('.react-transform-component')
      if (!c) return null
      const m = getComputedStyle(c).transform
      return m === 'none' ? 1 : new DOMMatrix(m).a
    }, i)
    const dialogOpen = () => page.evaluate(() => !!document.querySelector('[role="dialog"]'))

    await page.goto(process.env.DEMO_URL ?? 'http://localhost:5199/')
    await page.tap('[data-testid="tile-0"]')
    await sleep(500)
    const shown = await page.evaluate(() => { const s = document.querySelector('[data-index="0"]').parentElement; return Math.round(s.scrollLeft / s.clientWidth) })
    ok('opens on photo 1 and SHOWS photo 1 (focus does not jump to a later slide)', (await counter()) === '1 / 5' && shown === 0, `counter=${await counter()} showing=${shown}`)
    await page.keyboard.press('Escape'); await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 3000 }).catch(() => {})
    await page.tap('[data-testid="tile-1"]')
    await sleep(500)
    ok('opens on tapped photo', (await counter()) === '2 / 5', await counter())

    await gesture([[320, 400]], [[100, 405]], 30, 16)
    await sleep(700)
    ok('one-finger swipe goes to next', (await counter()) === '3 / 5', await counter())

    await gesture([[180, 420], [210, 430]], [[90, 330], [300, 520]])
    await sleep(500)
    const s1 = await scale(2)
    ok('pinch zooms the photo', s1 > 1.3, `scale=${s1}`)
    const arrow = () => page.evaluate(() => { const b = document.querySelector('button[aria-label="Next"]'); return b && { disabled: b.disabled, opacity: +getComputedStyle(b).opacity } })
    ok('arrows disabled + faded while zoomed', (await arrow())?.disabled && (await arrow())?.opacity === 0, JSON.stringify(await arrow()))
    ok('pinch did not close', await dialogOpen())

    const before = await page.evaluate(() => getComputedStyle(document.querySelector('[data-index="2"] .react-transform-component')).transform)
    await gesture([[300, 400]], [[100, 400]])
    await sleep(600)
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('[data-index="2"] .react-transform-component')).transform)
    ok('drag while zoomed pans, not navigates', (await counter()) === '3 / 5' && before !== after, `${await counter()}`)

    await gesture([[196, 400]], [[196, 400]], 1, 0); await sleep(80); await gesture([[196, 400]], [[196, 400]], 1, 0)
    await sleep(600)
    ok('double-tap while zoomed resets', (await scale(2)) < 1.01, `scale=${await scale(2)}`)
    // The fade-in starts as the zoom-out animation ends, so wait for it rather than sampling once.
    await page.waitForFunction(() => +getComputedStyle(document.querySelector('button[aria-label="Next"]')).opacity === 1, null, { timeout: 2000 }).catch(() => {})
    ok('arrows back after reset', !(await arrow())?.disabled && (await arrow())?.opacity === 1, JSON.stringify(await arrow()))

    await gesture([[196, 400]], [[196, 400]], 1, 0); await sleep(150); await gesture([[196, 400]], [[196, 400]], 1, 0)
    await sleep(600)
    ok('double-tap zooms in', (await scale(2)) > 2, `scale=${await scale(2)}`)

    await page.keyboard.press('ArrowLeft')
    await sleep(800)
    ok('arrow key navigates', (await counter()) === '2 / 5', await counter())
    ok('previous slide reset to 1x', (await scale(2)) < 1.01, `scale=${await scale(2)}`)

    await gesture([[196, 300]], [[196, 520]])
    await sleep(600)
    ok('drag down closes', !(await dialogOpen()))

    await page.tap('[data-testid="tile-0"]', { timeout: 3000 }).catch(() => console.log('FAIL could not reopen (viewer still up)'))
    await sleep(500)
    await gesture([[196, 300]], [[200, 330]])
    await sleep(400)
    ok('short drag down does not close', await dialogOpen())

    await page.setViewportSize({ width: 393, height: 852 })
    ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
  }
  console.log(results.join('\n'))
})()
