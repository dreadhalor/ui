import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Lightbox, LightboxZoom } from '../src/lightbox'
import './styles.css'

/** Every shared component, live, with its states - the package's own gallery page. */
const PHOTOS = ['/test-1.svg', '/test-2.svg', '/test-3.svg', '/test-4.svg']

function LightboxDemo() {
  const [viewing, setViewing] = useState<number | null>(null)
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">Lightbox</h2>
      <p className="text-neutral-400 text-sm">
        Tap a tile. Swipe or arrow-key between slides, drag down to close, pinch or double-tap to
        zoom.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {PHOTOS.map((src, i) => (
          <button key={src} type="button" onClick={() => setViewing(i)} data-testid={`tile-${i}`}>
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
      />
    </section>
  )
}

function App() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="font-bold text-2xl">@dreadhalor/ui</h1>
      <LightboxDemo />
    </main>
  )
}

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
