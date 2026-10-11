'use client'

import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { ConfirmDialog, type ConfirmDialogProps, type ConfirmTheme } from './confirm-dialog'

export type ConfirmOptions = Pick<
  ConfirmDialogProps,
  'title' | 'description' | 'confirmLabel' | 'cancelLabel' | 'danger' | 'children'
>

type Ask = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask | null>(null)

/**
 * `const confirm = useConfirm()` then `if (!(await confirm({ title: 'Delete it?', danger: true }))) return`.
 * Resolves true on confirm, false on Cancel, Escape or the backdrop. For an
 * action that should run INSIDE the dialog (disabled while it works, errors
 * shown in place), render <ConfirmDialog> with an async onConfirm instead.
 */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext)
  if (!ask) throw new Error('useConfirm() must be used inside a <ConfirmProvider>')
  return ask
}

/** Hosts the one dialog `useConfirm()` opens. Put it near the root, once. */
export function ConfirmProvider({
  theme,
  children,
}: {
  theme?: Partial<ConfirmTheme>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  // Kept after closing, so the dialog still has its words while it fades out.
  const [options, setOptions] = useState<ConfirmOptions>({ title: '' })
  const pending = useRef<((answer: boolean) => void) | null>(null)

  const settle = useCallback((answer: boolean) => {
    pending.current?.(answer)
    pending.current = null
  }, [])

  const ask = useCallback<Ask>(
    (o) => {
      // A second question while one is open: the first is answered "no".
      settle(false)
      setOptions(o)
      setOpen(true)
      return new Promise<boolean>((resolve) => {
        pending.current = resolve
      })
    },
    [settle],
  )

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <ConfirmDialog
        {...options}
        theme={theme}
        open={open}
        onOpenChange={(o) => {
          if (o) return
          setOpen(false)
          settle(false)
        }}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  )
}
