// ConfirmDialog + useConfirm against the demo page.
const { chromium } = require('playwright-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  })
  const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`)
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(process.env.DEMO_URL ?? 'http://localhost:5199/')
    const dialog = () => page.$('[role="alertdialog"]')
    const gone = () => page.waitForSelector('[role="alertdialog"]', { state: 'detached', timeout: 3000 }).then(() => true, () => false)
    const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim())
    const log = () => page.textContent('[data-testid="confirm-log"]')
    const bubbled = async () => Number(await page.textContent('[data-testid="bubbled"]'))

    // Danger: opens on Cancel; Enter answers no.
    await page.click('[data-testid="confirm-danger"]'); await sleep(300)
    ok('danger dialog opens focused on Cancel', (await focused()) === 'Cancel', await focused())
    await page.keyboard.press('Enter')
    ok('Enter on a danger dialog cancels', (await gone()) && !(await log()).includes('deleted'))

    // Plain: opens on the action.
    await page.click('[data-testid="confirm-plain"]'); await sleep(300)
    ok('plain dialog opens focused on the action', (await focused()) === 'Publish', await focused())
    await page.keyboard.press('Enter')
    ok('Enter confirms a plain dialog', (await gone()) && (await log()).includes('published'))

    // Async success: pending inside the dialog, then closes.
    const before = await bubbled()
    await page.click('[data-testid="confirm-danger"]'); await sleep(300)
    const b0 = await bubbled()
    await page.click('[role="alertdialog"] button:has-text("Delete")'); await sleep(150)
    const busy = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('[role="alertdialog"] button')]
      return { disabled: bs.every((b) => b.disabled), label: bs[1]?.textContent.trim(), spin: !!document.querySelector('[role="alertdialog"] .animate-spin') }
    })
    ok('async: both buttons disabled, pending label + spinner', busy.disabled && busy.label === 'Deleting…' && busy.spin, JSON.stringify(busy))
    await page.keyboard.press('Escape'); await sleep(100)
    ok('Escape ignored while pending', !!(await dialog()))
    await page.mouse.click(30, 30); await sleep(100)
    ok('backdrop ignored while pending', !!(await dialog()))
    ok('async success closes when done', (await gone()) && (await log()).includes('deleted'))
    ok('clicks inside the dialog do not bubble to the page', (await bubbled()) === b0, `before open ${before}, opened ${b0}, after ${await bubbled()}`)

    // Async failure: error shown in place, dialog stays, buttons usable again.
    await page.click('[data-testid="confirm-fails"]'); await sleep(300)
    await page.click('[role="alertdialog"] button:has-text("Delete")'); await sleep(900)
    const failed = await page.evaluate(() => ({
      alert: document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent,
      enabled: [...document.querySelectorAll('[role="alertdialog"] button')].every((b) => !b.disabled),
    }))
    ok('async failure: error shown, dialog stays, buttons enabled', failed.alert === 'The server said no.' && failed.enabled, JSON.stringify(failed))
    await page.click('[role="alertdialog"] button:has-text("Cancel")')
    ok('Cancel closes after a failure', await gone())
    await page.click('[data-testid="confirm-fails"]'); await sleep(300)
    ok('reopening starts clean (no stale error)', !(await page.$('[role="alertdialog"] [role="alert"]')))
    await page.mouse.click(30, 30)
    ok('backdrop click cancels', await gone())

    // useConfirm(): true / false.
    await page.click('[data-testid="confirm-ask"]'); await sleep(300)
    await page.click('[role="alertdialog"] button:has-text("Archive")'); await gone()
    await page.click('[data-testid="confirm-ask"]'); await sleep(300)
    await page.keyboard.press('Escape'); await gone(); await sleep(100)
    ok('useConfirm resolves true, then false on Escape', (await log()).includes('asked: true · asked: false'), await log())

    // From inside the Lightbox: above it, and isolated from it.
    const m = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })
    const p2 = await m.newPage()
    await p2.goto(process.env.DEMO_URL ?? 'http://localhost:5199/')
    const cdp = await m.newCDPSession(p2)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
    async function drag(from, to) { await touch('touchStart', [from]); for (let s = 1; s <= 12; s++) { await touch('touchMove', [[from[0] + ((to[0] - from[0]) * s) / 12, from[1] + ((to[1] - from[1]) * s) / 12]]); await sleep(16) } await touch('touchEnd', []) }
    await p2.tap('[data-testid="tile-0"]'); await sleep(600)
    await p2.tap('[data-testid="lightbox-delete"]'); await sleep(400)
    const top = await p2.evaluate(() => {
      const r = document.querySelector('[role="alertdialog"]').getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + 20)
      return !!hit?.closest('[role="alertdialog"]')
    })
    ok('confirm sits above the lightbox', top)
    // Nested inside the Lightbox's dialog, the backdrop must still render and dim it.
    const dims = await p2.evaluate(() => {
      const bd = [...document.querySelectorAll('[role="presentation"], div')].find((d) => d.className?.includes?.('bg-black/60') && getComputedStyle(d).position === 'fixed')
      return !!bd && getComputedStyle(bd).opacity === '1'
    })
    ok('backdrop renders (dims the lightbox) even though nested', dims)
    const box = await p2.evaluate(() => { const r = document.querySelector('[role="alertdialog"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + 20] })
    await drag(box, [box[0], box[1] + 250]); await sleep(500)
    ok('drag on the confirm does not close the lightbox', !!(await p2.$('[role="dialog"]')) && !!(await p2.$('[role="alertdialog"]')))
    await p2.keyboard.press('ArrowRight'); await sleep(500)
    const c = await p2.evaluate(() => [...document.querySelectorAll('span')].find((s) => /^\d+ \/ \d+$/.test(s.textContent.trim()))?.textContent.trim())
    ok('arrow key in the confirm does not change photo', c === '1 / 5', c)
    await p2.tap('[role="alertdialog"] button:has-text("Cancel")')
    await p2.waitForSelector('[role="alertdialog"]', { state: 'detached', timeout: 3000 }).catch(() => {})
    ok('cancel leaves the lightbox open', !(await p2.$('[role="alertdialog"]')) && !!(await p2.$('[role="dialog"]')))

    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
  }
})()
