import { useEffect, useRef, useState } from 'react'

import {
  meanOffsetMs,
  totalMisses,
  totalRounds,
  type GameState,
  type Stats,
} from '../game/engine'
import {
  lastScoreName,
  loadScores,
  MAX_NAME_LEN,
  newEntryAt,
  saveScore,
  type ScoreEntry,
} from '../scores/client'
import { isPlainKey } from '../window'
import { Ranking } from './Ranking'

type Props = {
  state: GameState
  mode: string
  onRetry: () => void
  onMenu: () => void
}

const TIERS = [
  { key: 'perfect', label: 'PERFECT', color: 'text-gold' },
  { key: 'great', label: 'GREAT', color: 'text-magenta' },
  { key: 'good', label: 'GOOD', color: 'text-cyan' },
  { key: 'bad', label: 'BAD', color: 'text-purple' },
] as const satisfies readonly { key: keyof Stats; label: string; color: string }[]

export function GameOver({ state, mode, onRetry, onMenu }: Props) {
  const [name, setName] = useState('')
  const [board, setBoard] = useState<ScoreEntry[]>([])
  const [saved, setSaved] = useState(false)
  const [mine, setMine] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadScores(mode).then(setBoard, (e: unknown) => setError(String(e)))
  }, [mode])

  // El nombre de la última partida viene ya escrito. Es lo que evita el
  // XIZA / XIZAAAA / GAAA que aparece cuando hay que teclearlo cada vez.
  useEffect(() => {
    lastScoreName().then(
      (previo) => previo !== null && setName(previo),
      () => {},
    )
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // ALT+ENTER es pantalla completa, no "guardar".
      if (event.key !== 'Enter' || !isPlainKey(event)) return
      // Con el foco en el input, ENTER guarda. Afuera, reintenta.
      if (event.target === inputRef.current) void save()
      else onRetry()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function save() {
    if (saved) return
    try {
      const actualizado = await saveScore({
        name,
        score: state.score,
        maxCombo: state.maxCombo,
        mode,
      })

      setMine(newEntryAt(board, actualizado))
      setBoard(actualizado)
      setSaved(true)
      setError(null)
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  const s = state.stats
  const rounds = totalRounds(s)
  const pct = (n: number) => (rounds === 0 ? '0%' : `${Math.round((n / rounds) * 100)}%`)
  const offset = meanOffsetMs(s)

  return (
    <div className="fixed inset-0 grid place-content-center justify-items-center gap-6 overflow-y-auto bg-night px-6 py-10 text-center">
      <h2 className="chrome font-display text-5xl leading-none">GAME OVER</h2>

      <div className="flex gap-12">
        <Cell label="PUNTAJE" value={state.score} className="text-cyan" />
        <Cell label="MAX COMBO" value={state.maxCombo} className="text-magenta" />
      </div>

      <div className="flex flex-wrap justify-center gap-8">
        {TIERS.map((tier) => (
          <Cell
            key={tier.key}
            label={tier.label}
            value={s[tier.key]}
            sub={pct(s[tier.key])}
            className={tier.color}
            small
          />
        ))}
        <Cell
          label="MISS"
          value={totalMisses(s)}
          sub={pct(totalMisses(s))}
          className="text-red"
          small
        />
      </div>

      <div className="flex flex-col gap-1 text-[13px] text-ink-soft">
        <span>
          sin terminar a tiempo {s.missTimeout} · espacio anticipado {s.missIncomplete} · fuera
          de zona {s.missWindow}
        </span>
        {offset !== null && (
          <span className={Math.abs(offset) < 25 ? 'font-bold text-gold' : 'font-bold'}>
            desvío medio {offset > 0 ? '+' : ''}
            {Math.round(offset)}ms —{' '}
            {Math.abs(offset) < 25
              ? 'centrado'
              : offset < 0
                ? 'presionas ANTES de tiempo'
                : 'presionas DESPUÉS'}
          </span>
        )}
      </div>

      {!saved && (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            maxLength={MAX_NAME_LEN}
            placeholder="TU NOMBRE"
            autoFocus
            className="w-[190px] rounded-lg border-2 border-line bg-sunken px-4 py-3 text-center font-bold tracking-[2px] text-ink outline-none focus:border-cyan"
          />
          <button
            onClick={() => void save()}
            className="cursor-pointer rounded-lg bg-linear-to-b from-gold-light to-gold-dark px-6 py-3 font-bold text-night"
          >
            GUARDAR
          </button>
        </div>
      )}

      {error !== null && (
        <p className="max-w-[420px] text-[13px] text-red">No se pudo guardar: {error}</p>
      )}

      <Ranking
        mode={mode}
        entries={board}
        highlight={mine}
        emptyHint="Guarda tu puntaje para estrenar esta tabla."
      />

      {saved && mine === null && (
        <p className="text-[13px] text-ink-muted">
          Guardado, pero no alcanzó para el top 5 de esta configuración.
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="cursor-pointer rounded-xl bg-linear-to-b from-magenta-light to-magenta-dark px-8 py-3 font-display text-lg text-white"
        >
          REINTENTAR ⏎
        </button>
        <button
          onClick={onMenu}
          className="cursor-pointer rounded-xl border-2 border-line px-6 py-3 font-bold text-ink-soft hover:border-ink-muted"
        >
          MENÚ
        </button>
      </div>
    </div>
  )
}

function Cell({
  label,
  value,
  sub,
  className,
  small,
}: {
  label: string
  value: number
  sub?: string
  className: string
  small?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-bold tracking-[3px] text-ink-muted">{label}</span>
      <span className={`font-display ${small ? 'text-2xl' : 'text-4xl'} ${className}`}>
        {value}
      </span>
      {sub !== undefined && <span className="text-[12px] text-ink-muted">{sub}</span>}
    </div>
  )
}
