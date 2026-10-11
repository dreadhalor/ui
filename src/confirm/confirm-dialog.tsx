'use client'

import { AlertDialog } from '@base-ui/react/alert-dialog'
import { type ReactNode, type SyntheticEvent, useEffect, useRef, useState } from 'react'

/**
 * Class strings for each part. An app defines its theme ONCE (its colours,
 * radius, type) and every confirm in it looks native. A slot you set REPLACES
 * the default slot - spread `defaultConfirmTheme` to start from it.
 */
export type ConfirmTheme = {
  backdrop: string
  popup: string
  title: string
  description: string
  error: string
  actions: string
  cancel: string
  confirm: string
  /** The confirm button when `danger` is set. */
  danger: string
}

const FADE =
  'transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0'
const POP =
  'transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'

/**
 * Neutral dark. z-[150] puts it above a full-screen viewer (the Lightbox is
 * z-[100]) and an ordinary modal, since a confirm is always the top question.
 */
export const defaultConfirmTheme: ConfirmTheme = {
  backdrop: `fixed inset-0 z-[150] bg-black/60 ${FADE}`,
  popup: `fixed inset-x-4 top-1/2 z-[150] mx-auto max-w-sm -translate-y-1/2 rounded-xl border border-neutral-800 bg-neutral-950 p-6 shadow-xl outline-none ${POP}`,
  title: 'font-semibold text-base text-white',
  description: 'mt-2 text-neutral-400 text-sm leading-relaxed',
  error: 'mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-red-300 text-sm',
  actions: 'mt-5 flex justify-end gap-2',
  cancel:
    'rounded-lg px-4 py-2 font-medium text-neutral-300 text-sm transition-colors hover:bg-neutral-800 disabled:opacity-50',
  confirm:
    'inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-neutral-950 text-sm transition-colors hover:bg-neutral-200 disabled:opacity-50',
  danger:
    'inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50',
}

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Defaults to "Confirm". */
  confirmLabel?: ReactNode
  /** Shown on the confirm button while an async `onConfirm` runs, e.g. "Deleting…". */
  pendingLabel?: ReactNode
  /** Defaults to "Cancel". */
  cancelLabel?: ReactNode
  /** A destructive action: red button, and the dialog opens focused on Cancel. */
  danger?: boolean
  /**
   * The action. If it returns a promise the dialog stays open and disabled
   * until it settles: resolved closes it; thrown keeps it open with the error
   * shown, so a failure is never hidden behind a closed dialog.
   */
  onConfirm: () => unknown
  theme?: Partial<ConfirmTheme>
  /** Extra content between the description and the buttons. */
  children?: ReactNode
}

/**
 * A yes-or-no question, on Base UI's alert dialog. What each app had learned
 * the hard way separately, in one place:
 *
 * - A DANGER dialog opens on the safe answer, so a reflexive Enter keeps
 *   things (Fiscala, 9/24/26: a Remove opened focused on Remove). An ordinary
 *   confirm opens on the action.
 * - An async action runs INSIDE the dialog: both buttons disabled, Escape and
 *   the backdrop ignored, a failure shown here rather than behind it.
 * - Events stop at the dialog. React bubbles portal events through the REACT
 *   tree, so a click in a dialog opened from inside a <Link> navigated
 *   (Fiscala, 9/21/26), and a drag on one opened from a swipeable panel
 *   dragged the panel (the Us edit layer).
 * - Escape, Cancel and a tap on the backdrop all answer no.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  pendingLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  theme,
  children,
}: ConfirmDialogProps) {
  const t = { ...defaultConfirmTheme, ...theme }
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Each opening starts clean.
  useEffect(() => {
    if (open) {
      setPending(false)
      setError(null)
    }
  }, [open])

  const close = () => {
    if (!pending) onOpenChange(false)
  }

  const run = async () => {
    if (pending) return
    setError(null)
    let result: unknown
    try {
      result = onConfirm()
    } catch (e) {
      setError(message(e))
      return
    }
    if (!(result instanceof Promise)) return onOpenChange(false)
    setPending(true)
    try {
      await result
      setPending(false)
      onOpenChange(false)
    } catch (e) {
      setPending(false)
      setError(message(e))
    }
  }

  const stop = (e: SyntheticEvent) => e.stopPropagation()
  const contain = {
    onClick: stop,
    onPointerDown: stop,
    onPointerMove: stop,
    onPointerUp: stop,
    onTouchStart: stop,
    onTouchMove: stop,
    onTouchEnd: stop,
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop
          // Base UI drops the backdrop of a dialog opened inside another one -
          // a delete confirm from inside the Lightbox left the photo undimmed.
          forceRender
          {...contain}
          onClick={(e) => {
            stop(e)
            close()
          }}
          className={t.backdrop}
        />
        <AlertDialog.Popup
          {...contain}
          initialFocus={danger ? cancelRef : confirmRef}
          className={t.popup}
        >
          <AlertDialog.Title className={t.title}>{title}</AlertDialog.Title>
          {description != null && (
            <AlertDialog.Description className={t.description}>
              {description}
            </AlertDialog.Description>
          )}
          {children}
          {error && (
            <p role="alert" className={t.error}>
              {error}
            </p>
          )}
          <div className={t.actions}>
            <button
              ref={cancelRef}
              type="button"
              onClick={close}
              disabled={pending}
              className={t.cancel}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={run}
              disabled={pending}
              aria-busy={pending || undefined}
              className={danger ? t.danger : t.confirm}
            >
              {pending && <Spinner />}
              {pending && pendingLabel != null ? pendingLabel : confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

function message(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  return typeof e === 'string' && e ? e : 'Something went wrong'
}

// Inline, so the package doesn't pin an icon library on its users.
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin" aria-hidden="true">
      <path
        d="M21 12a9 9 0 1 1-6.219-8.56"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}
