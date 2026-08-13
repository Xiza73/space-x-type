import { useEffect, useState } from 'react'

import { loadScores, type ScoreEntry } from '../scores/client'

type Props = {
  /** Clave de la tabla. Cada configuración tiene la suya. */
  mode: string
  /**
   * Entradas ya cargadas. Si viene, no se consulta el disco.
   *
   * La pantalla de resultados ya tiene la tabla —se la devuelve el comando que
   * guarda— y volver a pedirla sería una lectura de más que además podría
   * mostrar algo distinto a lo que se acaba de guardar.
   */
  entries?: readonly ScoreEntry[]
  /** `at` de la entrada recién guardada, para marcarla como tuya. */
  highlight?: number | null
  /** Se muestra cuando la tabla está vacía. */
  emptyHint?: string
  /**
   * Su propio encabezado. Se apaga dentro de un modal, que ya tiene título:
   * si no, "RANKING" aparece dos veces, una arriba de la otra.
   */
  heading?: boolean
}

/**
 * Top 5 de una configuración.
 *
 * Se usa en el menú y en la pantalla de resultados. En el menú es donde de
 * verdad hace falta: un ranking que solo se puede ver perdiendo una partida es
 * un ranking que no se mira.
 */
export function Ranking({
  mode,
  entries,
  highlight = null,
  emptyHint,
  heading = true,
}: Props) {
  const [loaded, setLoaded] = useState<ScoreEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (entries !== undefined) return
    let cancelled = false
    loadScores(mode).then(
      (list) => {
        if (cancelled) return
        setLoaded(list)
        // Limpiar el error en el camino feliz no es un detalle: sin esto, un
        // fallo al arrancar deja el mensaje pegado para siempre aunque las
        // lecturas siguientes anden bien.
        setError(null)
      },
      (e: unknown) => !cancelled && setError(String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [mode, entries])

  const board = entries ?? loaded

  return (
    <div
      className={`flex w-[min(360px,86vw)] flex-col gap-2 text-left ${
        heading
          ? 'rounded-2xl border border-line-card bg-linear-to-b from-surface to-surface-deep px-5 py-4'
          : ''
      }`}
    >
      {heading && (
        <span className="text-[11px] font-bold tracking-[3px] text-ink-muted">RANKING</span>
      )}

      {error !== null && <p className="text-[13px] text-red">{error}</p>}

      {board.length === 0 && error === null && (
        <p className="text-[13px] text-ink-muted">
          {emptyHint ?? 'Todavía nadie puntuó en esta configuración.'}
        </p>
      )}

      {board.map((entry, i) => {
        const mine = highlight !== null && entry.at === highlight
        return (
          <div
            key={`${entry.at}-${entry.name}-${entry.score}`}
            className={`flex items-baseline justify-between gap-6 rounded px-2 py-1 text-sm ${
              mine ? 'bg-gold/15' : ''
            }`}
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <b className={mine ? 'text-gold' : 'text-ink-muted'}>#{i + 1}</b>
              <span className={`truncate font-semibold ${mine ? 'text-gold' : ''}`}>
                {entry.name}
              </span>
              {mine && <span className="text-[10px] tracking-[2px] text-gold">TÚ</span>}
            </span>
            <span className="flex shrink-0 items-baseline gap-3">
              <span className="text-[11px] text-ink-muted">x{entry.maxCombo}</span>
              <span className="font-display text-[13px] text-cyan">{entry.score}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
