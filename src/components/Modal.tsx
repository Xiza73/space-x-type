import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Modal sobre el `<dialog>` nativo.
 *
 * Se usa el elemento del navegador y no un div con posición fija porque
 * `showModal()` ya trae lo que hay que hacer bien: atrapa el foco adentro, lo
 * devuelve al cerrar, cierra con ESCAPE y pone el fondo inerte. Reimplementar
 * eso a mano es la parte que siempre queda a medias.
 */
export function Modal({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      // `close` cubre los dos caminos: el botón y la tecla ESCAPE, que el
      // navegador maneja solo.
      onClose={onClose}
      // Click en el fondo. El `<dialog>` ocupa toda la pantalla, así que un
      // click sobre él —y no sobre su contenido— es un click afuera.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className="m-auto rounded-2xl border border-line-card bg-linear-to-b from-surface to-surface-deep p-0 text-ink backdrop:bg-night/80"
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center justify-between gap-8">
          <span className="text-[11px] font-bold tracking-[3px] text-ink-muted">{title}</span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="cursor-pointer rounded px-2 text-ink-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </dialog>
  )
}
