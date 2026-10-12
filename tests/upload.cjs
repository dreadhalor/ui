// useUploadQueue + send against the demo's stand-in upload server (vite.config.ts).
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'))
const file = (name, bytes) => {
  const p = path.join(dir, name)
  fs.writeFileSync(p, Buffer.alloc(bytes, 7))
  return p
}

;(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  })
  const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`)
  const base = process.env.DEMO_URL ?? 'http://localhost:5199/'
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const cdp = await page.context().newCDPSession(page)
    const throttle = (bps) =>
      cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: bps })
    await cdp.send('Network.enable')
    await page.goto(base)
    const items = () =>
      page.$$eval('[data-testid="upload-item"]', (els) =>
        els.map((e) => ({
          name: e.dataset.name,
          status: e.dataset.status,
          sent: Number(e.dataset.sent),
          total: Number(e.dataset.total),
          error: e.querySelector('[data-testid="upload-error"]')?.textContent ?? null,
        })),
      )
    const item = async (name) => (await items()).find((i) => i.name === name)
    const stats = async (reset) => (await (await page.request.get(base + 'demo-upload' + (reset ? '?reset' : ''))).json()).maxInFlight
    const idle = () => page.waitForFunction(() => document.querySelector('[data-testid="upload-totals"]')?.textContent.includes('busy false'), null, { timeout: 30000 })

    // 1. A mixed batch, one at a time, with real progress.
    await stats(true)
    await throttle(1_000_000) // ~1 MB/s, so a 3 MB file shows progress along the way
    await page.setInputFiles('[data-testid="upload-input"]', [
      file('a-big.bin', 3_000_000),
      file('b-slow.bin', 100_000),
      file('c-fail.bin', 100_000),
      file('d-toobig.bin', 100_000),
      file('e-flaky.bin', 100_000),
      file('f-huge.bin', 6_000_000),
    ])
    const seen = new Set()
    const statuses = new Set()
    for (let t = 0; t < 120; t++) {
      const a = await item('a-big.bin')
      if (a) seen.add(a.sent)
      const b = await item('b-slow.bin')
      if (b) statuses.add(b.status)
      if (a?.status === 'done' && b?.status === 'done') break
      await sleep(50)
    }
    await throttle(-1)
    await idle()
    const partial = [...seen].filter((s) => s > 0 && s < 3_000_000)
    ok('real byte progress (several partial values on the way)', partial.length >= 2, `${partial.length} partial values`)
    ok('"processing" shows between the last byte and the answer', statuses.has('processing'), [...statuses].join(','))
    ok('one at a time by default', (await stats()) === 1, `max in flight ${await stats()}`)
    const all = await items()
    const by = Object.fromEntries(all.map((i) => [i.name, i]))
    ok('good files done', by['a-big.bin'].status === 'done' && by['b-slow.bin'].status === 'done')
    ok('server JSON error shown as its own words', by['c-fail.bin'].error === 'The server refused c-fail.bin.', by['c-fail.bin'].error)
    ok('HTML 413 (a proxy) becomes plain words', by['d-toobig.bin'].error === 'That file is too big to send.', by['d-toobig.bin'].error)
    ok('validation fails a file before any request', by['f-huge.bin'].status === 'failed' && by['f-huge.bin'].error?.startsWith('Too big for the demo'), by['f-huge.bin'].error)
    const totals = await page.textContent('[data-testid="upload-totals"]')
    ok('overall bytes complete for the live files; settled once', totals.includes('3100000/3100000') && totals.includes('settled 1'), totals)

    // 2. Retry the failed ones: the flaky one goes through, the rest fail again, validation stays.
    await page.click('[data-testid="upload-retry"]')
    await sleep(300)
    await idle()
    const r = Object.fromEntries((await items()).map((i) => [i.name, i]))
    ok('retry: flaky file goes through', r['e-flaky.bin'].status === 'done', r['e-flaky.bin'].status)
    ok('retry: refused ones fail again; too-big-by-validation never sent', r['c-fail.bin'].status === 'failed' && r['f-huge.bin'].error?.startsWith('Too big for the demo'))

    // 3. Two at a time.
    await page.reload()
    await stats(true)
    await page.selectOption('[data-testid="upload-concurrency"]', '2')
    await page.setInputFiles('[data-testid="upload-input"]', ['1', '2', '3', '4'].map((n) => file(`slow-${n}.bin`, 50_000)))
    await idle()
    ok('concurrency 2 keeps two in flight, never more', (await stats()) === 2, `max in flight ${await stats()}`)

    // 4. Cancel stops the one in flight and the queued ones.
    await page.reload()
    await throttle(200_000)
    await page.setInputFiles('[data-testid="upload-input"]', [file('x1.bin', 2_000_000), file('x2.bin', 2_000_000)])
    await sleep(800)
    await page.click('[data-testid="upload-cancel"]')
    await throttle(-1)
    await idle()
    const c = await items()
    ok('cancel: both end as "Cancelled", nothing still busy', c.every((i) => i.status === 'failed' && i.error === 'Cancelled'), JSON.stringify(c.map((i) => [i.name, i.status, i.error])))

    ok('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
  } finally {
    await browser.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})()
