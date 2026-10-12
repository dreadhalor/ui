'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UploadError } from './send'

export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'failed'

export type UploadItem<R = unknown> = {
  id: string
  file: File
  status: UploadStatus
  /** Bytes of this file sent so far. */
  sent: number
  /** This file's size in bytes. */
  total: number
  /** Why it failed, in words for a person. */
  error?: string
  /** What `upload` resolved to. */
  result?: R
}

export type UploadTask<R> = (
  file: File,
  ctx: {
    /** Report bytes sent. Reaching the total moves the item to "processing" until `upload` resolves. */
    progress: (sent: number, total?: number) => void
    /** Cancelled by `remove` or `cancel`: pass it to `send`. */
    signal: AbortSignal
  },
) => Promise<R>

export type UploadQueueOptions<R> = {
  /** Send one file. Throw (an UploadError, or any Error) to fail it with that message. */
  upload: UploadTask<R>
  /** Files in flight at once. Default 1: a phone on cellular does best one at a time. */
  concurrency?: number
  /** A reason the file can't go (too big, wrong type), or null. Checked on `add`, before any request. */
  validate?: (file: File) => string | null
  /** Called once the queue drains (nothing queued or in flight), with every item. */
  onSettled?: (items: UploadItem<R>[]) => void
}

const uuid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const messageOf = (e: unknown) =>
  e instanceof UploadError && e.kind === 'aborted'
    ? 'Cancelled'
    : e instanceof Error && e.message
      ? e.message
      : 'Upload failed'

/**
 * A queue of files going up, with per-file status and bytes, and the overall
 * total a progress bar actually needs. Headless: every app draws its own
 * (rings on tiles, a bar, "Adding photo 2 of 5… 40%") and talks to its own
 * server through `upload`.
 *
 *   const q = useUploadQueue({ upload: (file, { progress, signal }) => sendOrThrow(url, form(file), { onProgress: progress, signal }) })
 *   <input type="file" multiple onChange={(e) => q.add(e.target.files)} />
 *
 * Adding starts it. One file failing never stops the rest; `retry()` sends
 * the failed ones again.
 */
export function useUploadQueue<R = unknown>({
  upload,
  concurrency = 1,
  validate,
  onSettled,
}: UploadQueueOptions<R>) {
  const [items, setItems] = useState<UploadItem<R>[]>([])
  // Workers read and claim items synchronously, so the truth lives in a ref
  // and React state mirrors it.
  const ref = useRef<UploadItem<R>[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const running = useRef(0)
  const latest = useRef({ upload, onSettled, concurrency })
  latest.current = { upload, onSettled, concurrency }

  const commit = useCallback(() => setItems(ref.current), [])
  const patch = useCallback(
    (id: string, change: Partial<UploadItem<R>>) => {
      ref.current = ref.current.map((i) => (i.id === id ? { ...i, ...change } : i))
      commit()
    },
    [commit],
  )

  const pump = useCallback(() => {
    while (running.current < Math.max(1, latest.current.concurrency)) {
      const next = ref.current.find((i) => i.status === 'queued')
      if (!next) break
      running.current++
      const controller = new AbortController()
      controllers.current.set(next.id, controller)
      patch(next.id, { status: 'uploading', sent: 0, error: undefined })
      const progress = (sent: number, total = next.total) => {
        const item = ref.current.find((i) => i.id === next.id)
        if (!item || (item.status !== 'uploading' && item.status !== 'processing')) return
        const s = Math.min(Math.round((sent / Math.max(total, 1)) * next.total), next.total)
        patch(next.id, { sent: s, status: s >= next.total ? 'processing' : 'uploading' })
      }
      latest.current
        .upload(next.file, { progress, signal: controller.signal })
        .then(
          (result) => patch(next.id, { status: 'done', sent: next.total, result }),
          (e) => {
            if (ref.current.some((i) => i.id === next.id))
              patch(next.id, { status: 'failed', error: messageOf(e) })
          },
        )
        .finally(() => {
          controllers.current.delete(next.id)
          running.current--
          if (ref.current.some((i) => i.status === 'queued')) pump()
          else if (running.current === 0) latest.current.onSettled?.(ref.current)
        })
    }
  }, [patch])

  const add = useCallback(
    (files: FileList | File[] | null | undefined) => {
      const list = Array.from(files ?? [])
      if (!list.length) return []
      const added = list.map((file): UploadItem<R> => {
        const problem = validate?.(file) ?? null
        return {
          id: uuid(),
          file,
          status: problem ? 'failed' : 'queued',
          sent: 0,
          total: file.size,
          error: problem ?? undefined,
        }
      })
      ref.current = [...ref.current, ...added]
      commit()
      if (added.some((i) => i.status === 'queued')) pump()
      else if (running.current === 0) latest.current.onSettled?.(ref.current)
      return added.map((i) => i.id)
    },
    [commit, pump, validate],
  )

  /** Send failed items again - one, or all of them. Items that failed validation stay failed. */
  const retry = useCallback(
    (id?: string) => {
      ref.current = ref.current.map((i) =>
        i.status === 'failed' && (id ? i.id === id : true) && !validate?.(i.file)
          ? { ...i, status: 'queued', sent: 0, error: undefined }
          : i,
      )
      commit()
      pump()
    },
    [commit, pump, validate],
  )

  /** Take an item out of the list, cancelling it if it's in flight. */
  const remove = useCallback(
    (id: string) => {
      ref.current = ref.current.filter((i) => i.id !== id)
      commit()
      controllers.current.get(id)?.abort()
    },
    [commit],
  )

  /** Stop everything: in-flight uploads are cancelled, queued ones won't start. */
  const cancel = useCallback(() => {
    ref.current = ref.current.map((i) =>
      i.status === 'queued' ? { ...i, status: 'failed', error: 'Cancelled' } : i,
    )
    commit()
    for (const c of controllers.current.values()) c.abort()
  }, [commit])

  /** Forget finished items (done, by default). */
  const clear = useCallback(
    (which: UploadStatus[] = ['done']) => {
      ref.current = ref.current.filter((i) => !which.includes(i.status))
      commit()
    },
    [commit],
  )

  // Leaving the page cancels whatever is still going.
  useEffect(() => {
    const live = controllers.current
    return () => {
      for (const c of live.values()) c.abort()
    }
  }, [])

  const totals = useMemo(() => {
    const live = items.filter((i) => i.status !== 'failed')
    return {
      count: items.length,
      done: items.filter((i) => i.status === 'done').length,
      failed: items.filter((i) => i.status === 'failed').length,
      /** Bytes sent across every file that hasn't failed - the number a progress bar wants. */
      sent: live.reduce((a, i) => a + i.sent, 0),
      total: live.reduce((a, i) => a + i.total, 0),
    }
  }, [items])

  const busy = items.some(
    (i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'processing',
  )

  return { items, add, retry, remove, cancel, clear, busy, totals }
}
