'use client'

import { Dialog } from '@base-ui/react/dialog'
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { SlideContext } from './context'

/** How far a finger has to drag down before letting go closes the viewer. */
const CLOSE_DRAG_PX = 110

export type LightboxProps = {
  open: boolean
  onClose: () => void
  /** Number of slides. */
  count: number
  /** The slide on screen. Controlled: the viewer reports changes via onIndexChange. */
  index: number
  onIndexChange: (index: number) => void
  /** A slide's contents. Wrap an image in <LightboxZoom> to make it zoomable. */
  renderItem: (index: number) => ReactNode
  /** A stable React key per slide. Defaults to the index. */
  getKey?: (index: number) => string | number
  /** Read by screen readers, e.g. "Photo viewer". */
  label?: string
  /** The default close button, top right. Turn off to supply your own header. */
  closeButton?: boolean
  /** The default "3 / 12" counter, bottom centre. */
  counter?: boolean
  /** Drag down to close. Touches inside [data-lightbox-no-swipe] never start it. */
  swipeToClose?: boolean
  /** Left/right arrow keys step between slides (ignored while typing in a field). */
  keyboard?: boolean
  /** The positioned box the slides sit in, for portalling drawers or menus into it. */
  stageRef?: RefObject<HTMLDivElement | null>
  /** Anything else to draw over the slides: a header, a drawer, a dialog. */
  children?: ReactNode
}

/**
 * Full-screen viewer for photos and video: a native scroll-snap strip, arrows,
 * arrow keys, a counter, drag-down-to-close, and pinch/double-tap zoom on any
 * slide that wraps its image in <LightboxZoom>.
 *
 * Grown from LoadLab's photo-lightbox and the Us timeline's copy of it. Why it
 * is built the way it is:
 *
 * - It is meant to stay MOUNTED and be driven by `open`. Unmounting on close
 *   denies Base UI the frame its exit animation needs, so it vanishes instead
 *   of fading.
 * - Everything renders in a portal, so a transformed ancestor (a sliding
 *   panel) can't become the containing block for the fixed layers.
 * - Pointer and touch events stop here. React bubbles portal events through
 *   the REACT tree, so a swipe between photos also reached the swipe-to-dismiss
 *   of the panel the viewer was opened from, and closed it.
 * - Slides are `touch-action: pan-x`: one finger scrolls the strip natively,
 *   and the browser neither scrolls vertically (the drag-down is ours) nor
 *   pinch-zooms the PAGE, which on iOS ignores maximum-scale and otherwise
 *   zooms the whole viewer instead of the photo. A zoomed slide goes to
 *   `none` and the strip stops scrolling, so dragging pans the photo.
 */
export function Lightbox({
  open,
  onClose,
  count,
  index,
  onIndexChange,
  renderItem,
  getKey,
  label = 'Photo viewer',
  closeButton = true,
  counter = true,
  swipeToClose = true,
  keyboard = true,
  stageRef,
  children,
}: LightboxProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const programmatic = useRef(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [dragY, setDragY] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  const scrollTo = useCallback((i: number, smooth: boolean) => {
    const el = scroller.current
    if (!el) return
    programmatic.current = true
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'instant' })
    window.setTimeout(
      () => {
        programmatic.current = false
      },
      smooth ? 400 : 50,
    )
  }, [])

  // Land on the slide that was tapped rather than animating in from the
  // first. A frame's wait, because the popup has no width until it's laid out.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    const smooth = wasOpen.current
    wasOpen.current = true
    const el = scroller.current
    if (smooth && el && Math.round(el.scrollLeft / el.clientWidth) === index) return
    const f = requestAnimationFrame(() => scrollTo(index, smooth))
    return () => cancelAnimationFrame(f)
  }, [open, index, scrollTo])

  // A new slide starts unzoomed; its <LightboxZoom> reports if that changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on every slide change
  useEffect(() => setZoomed(false), [index])

  const step = useCallback(
    (by: number) => {
      const next = index + by
      if (next >= 0 && next < count) onIndexChange(next)
    },
    [index, count, onIndexChange],
  )

  // On the popup, not the document: Base UI's dialog stops arrow-key events
  // from propagating out of the popup, so a document listener never hears them.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!keyboard) return
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]'))
      return
    if (e.key === 'ArrowRight') step(1)
    if (e.key === 'ArrowLeft') step(-1)
  }

  // A clip keeps playing when you swipe past it or close the viewer unless
  // it's told not to. Pause every video that isn't on the current slide.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    for (const slide of Array.from(el.children)) {
      const here = open && Number((slide as HTMLElement).dataset.index) === index
      if (here) continue
      for (const v of Array.from(slide.querySelectorAll('video'))) v.pause()
    }
  }, [open, index])

  const onScroll = () => {
    const el = scroller.current
    // Not while closing: the exit animation scales the popup, the strip's
    // width changes, and the scroll event that follows reported a slide the
    // app had already let go of - with `index={viewing ?? 0}`, onIndexChange
    // then set `viewing` again and reopened the viewer. (LoadLab's original
    // guarded this with an isClosing ref.)
    if (!open || !el || programmatic.current || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index && i >= 0 && i < count) onIndexChange(i)
  }

  const stop = (e: SyntheticEvent) => e.stopPropagation()

  const onTouchStart = (e: TouchEvent) => {
    stop(e)
    const t = e.touches[0]
    const blocked = (e.target as HTMLElement).closest('[data-lightbox-no-swipe]')
    drag.current =
      swipeToClose && !zoomed && !blocked && e.touches.length === 1 && t
        ? { x: t.clientX, y: t.clientY }
        : null
    if (e.touches.length > 1) setDragY(0)
  }
  const onTouchMove = (e: TouchEvent) => {
    stop(e)
    const t = e.touches[0]
    // A second finger means a pinch, never a close.
    if (!drag.current || !t || e.touches.length > 1) {
      drag.current = null
      setDragY(0)
      return
    }
    const dx = t.clientX - drag.current.x
    const dy = t.clientY - drag.current.y
    // Only follow the finger vertically; horizontal belongs to the strip.
    if (Math.abs(dy) > Math.abs(dx)) setDragY(dy)
  }
  const onTouchEnd = (e: TouchEvent) => {
    stop(e)
    const start = drag.current
    drag.current = null
    setDragY(0)
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dy = t.clientY - start.y
    const dx = t.clientX - start.x
    if (Math.abs(dy) > CLOSE_DRAG_PX && Math.abs(dy) > Math.abs(dx)) onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/95 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          onKeyDown={onKeyDown}
          onPointerDown={stop}
          onPointerMove={stop}
          onPointerUp={stop}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          style={
            dragY
              ? {
                  translate: `0 ${dragY}px`,
                  opacity: 1 - Math.min(Math.abs(dragY) / 500, 0.7),
                  transition: 'none',
                }
              : undefined
          }
          className="fixed inset-0 z-[100] flex flex-col bg-transparent outline-none transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {index + 1} of {count}
          </Dialog.Description>

          <div ref={stageRef} className="relative h-full overflow-hidden">
            {/* While zoomed the arrows are disabled at once, so a tap can't
                land on one mid-fade, and fade out rather than vanish. */}
            {index > 0 && (
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous"
                disabled={zoomed}
                aria-hidden={zoomed || undefined}
                className={`absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-[opacity,background-color] duration-200 hover:bg-white/20 ${zoomed ? 'pointer-events-none opacity-0' : ''}`}
              >
                <Chevron dir="left" />
              </button>
            )}

            <div
              ref={scroller}
              onScroll={onScroll}
              className={`flex h-full snap-x snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${zoomed ? 'overflow-x-hidden' : 'overflow-x-auto'}`}
            >
              {Array.from({ length: count }, (_, i) => (
                <div
                  key={getKey?.(i) ?? i}
                  data-index={i}
                  style={{ touchAction: zoomed && i === index ? 'none' : 'pan-x' }}
                  className="flex h-full w-full shrink-0 snap-center items-center justify-center"
                >
                  <SlideContext.Provider
                    value={{ index: i, active: open && i === index, setZoomed }}
                  >
                    {renderItem(i)}
                  </SlideContext.Provider>
                </div>
              ))}
            </div>

            {index < count - 1 && (
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next"
                disabled={zoomed}
                aria-hidden={zoomed || undefined}
                className={`absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-[opacity,background-color] duration-200 hover:bg-white/20 ${zoomed ? 'pointer-events-none opacity-0' : ''}`}
              >
                <Chevron dir="right" />
              </button>
            )}

            {closeButton && (
              <Dialog.Close
                aria-label="Close"
                className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                <Cross />
              </Dialog.Close>
            )}

            {counter && count > 1 && (
              <span className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 font-medium text-white/80 text-xs backdrop-blur-sm">
                {index + 1} / {count}
              </span>
            )}

            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Inline icons, so the package doesn't pin a lucide-react version on its users.
function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" {...STROKE}>
      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  )
}

function Cross() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" {...STROKE}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const
