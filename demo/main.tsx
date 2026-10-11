import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfirmDialog, ConfirmProvider, useConfirm } from '../src/confirm'
import { Lightbox, LightboxZoom } from '../src/lightbox'
import './styles.css'

/** Every shared component, live, with its states - the package's own gallery page. */
const BASE = ['/test-1.svg', '/test-2.svg', '/test-3.svg', '/test-4.svg']
// `?n=300` repeats the test images into a long strip - LoadLab-sized - for memory checks.
const N = Number(new URLSearchParams(window.location.search).get('n')) || BASE.length
const PHOTOS = Array.from({ length: N }, (_, i) => BASE[i % BASE.length] as string)

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function LightboxDemo() {
  const [viewing, setViewing] = useState<number | null>(null)
  const [askDelete, setAskDelete] = useState(false)
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">Lightbox</h2>
      <p className="text-neutral-400 text-sm">
        Tap a tile. Swipe or arrow-key between slides, drag down to close, pinch or double-tap to
        zoom.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {PHOTOS.slice(0, 4).map((src, i) => (
          <button key={i} type="button" onClick={() => setViewing(i)} data-testid={`tile-${i}`}>
            <img src={src} alt={`Test ${i + 1}`} className="aspect-square w-full object-cover" />
          </button>
        ))}
      </div>
      <Lightbox
        open={viewing !== null}
        onClose={() => setViewing(null)}
        count={PHOTOS.length + 1}
        index={viewing ?? 0}
        onIndexChange={setViewing}
        renderItem={(i) =>
          i < PHOTOS.length ? (
            <LightboxZoom>
              <img
                src={PHOTOS[i]}
                alt={`Test ${i + 1}`}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain p-2"
              />
            </LightboxZoom>
          ) : (
            // A slide that isn't a photo, with something focusable in it - like
            // LoadLab's locked photos. Opening the viewer must not jump here.
            <div className="flex flex-col items-center gap-3 text-neutral-300">
              <p>Locked slide</p>
              <button type="button" className="rounded-lg bg-pink-600 px-4 py-2 text-white">
                Unlock
              </button>
            </div>
          )
        }
      >
        {/* A confirm opened from inside the viewer: it must sit above it, and
            drags or arrow keys in it must not reach the viewer. */}
        <button
          type="button"
          data-testid="lightbox-delete"
          onClick={() => setAskDelete(true)}
          className="absolute top-4 left-4 z-20 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white"
        >
          Delete
        </button>
        <ConfirmDialog
          open={askDelete}
          onOpenChange={setAskDelete}
          title="Delete this photo?"
          description="From inside the viewer."
          confirmLabel="Delete"
          danger
          onConfirm={() => {}}
        />
      </Lightbox>
    </section>
  )
}

function ConfirmDemo() {
  const [open, setOpen] = useState<null | 'danger' | 'plain' | 'fails'>(null)
  const [log, setLog] = useState<string[]>([])
  const [bubbled, setBubbled] = useState(0)
  const confirm = useConfirm()
  const note = (s: string) => setLog((l) => [...l, s])
  return (
    // Counts React events that escape a dialog: portals bubble through the React tree.
    <section
      className="space-y-3"
      onClick={() => setBubbled((n) => n + 1)}
      onPointerDown={() => setBubbled((n) => n + 1)}
    >
      <h2 className="font-semibold text-lg">Confirm</h2>
      <p className="text-neutral-400 text-sm">
        Danger opens on Cancel; async actions run inside the dialog; failures stay in it.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="confirm-danger"
          onClick={() => setOpen('danger')}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm"
        >
          Delete (async, works)
        </button>
        <button
          type="button"
          data-testid="confirm-fails"
          onClick={() => setOpen('fails')}
          className="rounded-lg bg-red-900 px-3 py-2 text-sm"
        >
          Delete (async, fails)
        </button>
        <button
          type="button"
          data-testid="confirm-plain"
          onClick={() => setOpen('plain')}
          className="rounded-lg bg-neutral-700 px-3 py-2 text-sm"
        >
          Publish
        </button>
        <button
          type="button"
          data-testid="confirm-ask"
          onClick={async () =>
            note(`asked: ${await confirm({ title: 'Archive it?', confirmLabel: 'Archive' })}`)
          }
          className="rounded-lg bg-neutral-700 px-3 py-2 text-sm"
        >
          useConfirm()
        </button>
      </div>
      <p className="text-neutral-500 text-xs" data-testid="confirm-log">
        {log.join(' · ') || 'nothing yet'} | bubbled: <span data-testid="bubbled">{bubbled}</span>
      </p>
      <ConfirmDialog
        open={open === 'danger'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Delete this memory?"
        description="It and its photos will be deleted. This cannot be undone."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        danger
        onConfirm={async () => {
          await wait(800)
          note('deleted')
        }}
      />
      <ConfirmDialog
        open={open === 'fails'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Delete this memory?"
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        danger
        onConfirm={async () => {
          await wait(500)
          throw new Error('The server said no.')
        }}
      />
      <ConfirmDialog
        open={open === 'plain'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Publish the schedule?"
        confirmLabel="Publish"
        onConfirm={() => note('published')}
      />
    </section>
  )
}

function App() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="font-bold text-2xl">@dreadhalor/ui</h1>
      <LightboxDemo />
      <ConfirmDemo />
    </main>
  )
}

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </StrictMode>,
  )
