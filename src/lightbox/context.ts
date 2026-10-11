'use client'

import { createContext, useContext } from 'react'

/** What a slide's contents need from the viewer around them. */
export type SlideState = {
  index: number
  /** The slide currently on screen. Off-screen slides reset their zoom. */
  active: boolean
  /**
   * On screen or next to it. Only these may hold anything expensive: a strip
   * can be hundreds of slides long, all mounted at once.
   */
  near: boolean
  /** Tell the viewer this slide is zoomed in, so swipes pan instead of navigating. */
  setZoomed: (zoomed: boolean) => void
}

export const SlideContext = createContext<SlideState | null>(null)

export function useSlide(): SlideState {
  const slide = useContext(SlideContext)
  if (!slide) throw new Error('useSlide() must be used inside a <Lightbox> slide')
  return slide
}
