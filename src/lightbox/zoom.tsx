'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from 'react-zoom-pan-pinch'
import { useSlide } from './context'

const TAP_SCALE = 2.5
/** A second tap starting this soon after the first lifts, this close to it, is a double-tap. */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_PX = 40
/** A touch that moves further than this was a swipe, not a tap. */
const TAP_SLOP_PX = 10

/**
 * Pinch, double-tap and pan for whatever it wraps - an <img>, usually. Put it
 * inside a <Lightbox> slide; it reads which slide is on screen from there.
 *
 * At 1x it ignores one-finger touches entirely, so the swipe between slides
 * and the swipe down to close stay native. Once zoomed it tells the viewer,
 * which turns both of those off so a drag pans the photo. A slide that leaves
 * the screen snaps back to 1x.
 *
 * Double-tap is done here rather than by the library: its window is 200ms,
 * which misses a relaxed double-tap, and a phone can also fire `dblclick` for
 * the same two taps, which would zoom in and straight back out. Touch taps are
 * counted from touchend; `dblclick` is only honoured from a mouse.
 */
export function LightboxZoom({
  children,
  maxScale = 4,
}: {
  children: ReactNode
  maxScale?: number
}) {
  const { active, setZoomed } = useSlide()
  const zoom = useRef<ReactZoomPanPinchRef>(null)
  const box = useRef<HTMLDivElement>(null)
  const [scaled, setScaled] = useState(false)

  useEffect(() => {
    if (!active) zoom.current?.resetTransform(0)
  }, [active])

  useEffect(() => {
    if (active) setZoomed(scaled)
  }, [active, scaled, setZoomed])

  useEffect(() => {
    const el = box.current
    if (!el) return
    // `second` is decided when the finger comes DOWN: a double-tap is a short
    // gap between lifting and touching again. Timing it lift-to-lift (as this
    // first did) counts the second tap's own duration too, and a relaxed
    // double-tap measured ~330ms that way, so most of them were missed.
    let start: { x: number; y: number; second: boolean } | null = null
    let lastTap: { t: number; x: number; y: number } | null = null
    let lastTouchAt = 0

    const toggle = (x: number, y: number) => {
      const z = zoom.current
      if (!z) return
      if (z.state.scale > 1.01) void z.resetTransform()
      else void z.zoomToPoint(Math.min(TAP_SCALE, maxScale), x, y)
    }

    const onTouchStart = (e: TouchEvent) => {
      const now = Date.now()
      lastTouchAt = now
      const t = e.touches[0]
      if (e.touches.length !== 1 || !t) {
        start = null
        lastTap = null
        return
      }
      const second =
        !!lastTap &&
        now - lastTap.t < DOUBLE_TAP_MS &&
        Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < DOUBLE_TAP_PX
      start = { x: t.clientX, y: t.clientY, second }
    }
    const onTouchEnd = (e: TouchEvent) => {
      lastTouchAt = Date.now()
      const t = e.changedTouches[0]
      if (!start || !t || e.touches.length > 0) return
      const { second } = start
      const moved = Math.hypot(t.clientX - start.x, t.clientY - start.y)
      start = null
      if (moved > TAP_SLOP_PX) {
        lastTap = null
        return
      }
      if (second) {
        lastTap = null
        // After the library's own touchend, which would otherwise start its
        // pan-settling animation and cancel this one.
        const { clientX, clientY } = t
        window.setTimeout(() => toggle(clientX, clientY), 0)
      } else {
        lastTap = { t: Date.now(), x: t.clientX, y: t.clientY }
      }
    }
    const onDoubleClick = (e: MouseEvent) => {
      if (Date.now() - lastTouchAt < 1000) return
      toggle(e.clientX, e.clientY)
    }

    // Capture phase: once zoomed, the library stops propagation of the
    // touches it pans with, so a bubbling listener never hears the taps.
    const opts = { capture: true, passive: true }
    el.addEventListener('touchstart', onTouchStart, opts)
    el.addEventListener('touchend', onTouchEnd, opts)
    el.addEventListener('dblclick', onDoubleClick, opts)
    return () => {
      el.removeEventListener('touchstart', onTouchStart, opts)
      el.removeEventListener('touchend', onTouchEnd, opts)
      el.removeEventListener('dblclick', onDoubleClick, opts)
    }
  }, [maxScale])

  return (
    <div ref={box} className="h-full w-full">
      <TransformWrapper
        ref={zoom}
        minScale={1}
        maxScale={maxScale}
        // A plain wheel or two-finger trackpad scroll moves between slides; a
        // trackpad pinch (which arrives as ctrl+wheel) still zooms.
        wheel={{ wheelDisabled: true }}
        doubleClick={{ disabled: true }}
        panning={{ disabled: !scaled }}
        onTransform={(_, s) => setScaled(s.scale > 1.01)}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
