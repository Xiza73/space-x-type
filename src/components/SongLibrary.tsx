import { useEffect, useState } from 'react'

import { measureDurationMs } from '../game/constants'
import {
  deleteSong,
  effectiveBpm,
  formatDuration,
  listSongs,
  processSong,
  setSongBpm,
  type SongStatus,
} from '../library/client'

type Props = {
  /** Canción elegida, o `null` para el chiptune simulado. */
  selected: SongStatus | null
  onSelect: (song: SongStatus | null) => void
}

export function SongLibrary({ selected, onSelect }: Props) {
  const [songs, setSongs] = useState<SongStatus[]>([])
  const [url, setUrl] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Carga inicial: llama al cliente directamente y no a `refresh`, que depende
  // de la selección y arrastraría media función a las dependencias del efecto.
  useEffect(() => {
    listSongs().then(setSongs, (e: unknown) => setError(String(e)))
  }, [])

  async function refresh(keepSelected = true) {
    try {
      const list = await listSongs()
      setSongs(list)
      // La selección guarda una copia: si cambió el tempo hay que refrescarla,
      // o la partida arrancaría con el valor anterior.
      if (keepSelected && selected !== null) {
        onSelect(list.find((s) => s.id === selected.id) ?? null)
      }
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  async function add() {
    if (url.trim() === '' || working) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const { song, reused } = await processSong(url)
      setNotice(reused ? `Ya estaba: ${song.title}` : `Listo: ${song.title}`)
      setUrl('')
      await refresh()
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setWorking(false)
    }
  }

  async function remove(id: string) {
    try {
      await deleteSong(id)
      if (selected?.id === id) onSelect(null)
      await refresh(false)
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  async function saveBpm(id: string, bpm: number | null) {
    try {
      await setSongBpm(id, bpm)
      await refresh()
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  return (
    <div className="flex w-[min(560px,86vw)] flex-col gap-3 rounded-2xl border border-line-card bg-linear-to-b from-surface to-surface-deep px-5 py-4 text-left">
      <span className="text-[11px] font-bold tracking-[3px] text-ink-muted">BIBLIOTECA</span>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="Pega una URL de YouTube"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border-2 border-line bg-sunken px-3 py-2.5 text-sm text-ink outline-none focus:border-cyan"
        />
        <button
          onClick={() => void add()}
          disabled={working}
          className="cursor-pointer rounded-lg bg-linear-to-b from-magenta-light to-magenta-dark px-5 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {working ? 'PROCESANDO…' : 'PROCESAR'}
        </button>
      </div>

      {working && (
        <p className="text-[13px] text-ink-soft">
          Descargando y analizando. Puede tardar bastante en canciones largas.
        </p>
      )}
      {error !== null && <p className="text-[13px] text-red">{error}</p>}
      {notice !== null && <p className="text-[13px] text-cyan">{notice}</p>}

      <ul className="flex flex-col gap-1">
        <li>
          <button
            onClick={() => onSelect(null)}
            aria-pressed={selected === null}
            className={`w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm ${
              selected === null ? 'bg-cyan/20 text-cyan' : 'bg-sunken text-ink-soft'
            }`}
          >
            Chiptune simulado
            <span className="ml-2 text-[12px] text-ink-muted">tempo a elección</span>
          </button>
        </li>

        {songs.map((song) => {
          const playable = song.intact && song.bpm !== null
          const bpm = effectiveBpm(song)
          return (
            <li key={song.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => playable && onSelect(song)}
                  aria-pressed={selected?.id === song.id}
                  disabled={!playable}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                    selected?.id === song.id ? 'bg-cyan/20 text-cyan' : 'bg-sunken'
                  } ${playable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span className="min-w-0 flex-1 truncate" title={song.title}>
                    {song.title}
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-muted">
                    {formatDuration(song.durationSec)}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold tracking-[1px]">
                    {!song.intact ? (
                      <span className="text-red">ROTA</span>
                    ) : bpm === null ? (
                      <span className="text-ink-muted">SIN ANALIZAR</span>
                    ) : (
                      <span className={song.bpmOverride === null ? 'text-gold' : 'text-cyan'}>
                        {Math.round(bpm)} BPM
                      </span>
                    )}
                  </span>
                </button>

                {song.bpm !== null && (
                  <button
                    onClick={() => setEditing(editing === song.id ? null : song.id)}
                    aria-label={`Ajustar tempo de ${song.title}`}
                    aria-expanded={editing === song.id}
                    className="shrink-0 cursor-pointer rounded px-2 py-1 text-[12px] text-ink-muted hover:text-cyan"
                  >
                    ♪
                  </button>
                )}
                <button
                  onClick={() => void remove(song.id)}
                  aria-label={`Eliminar ${song.title}`}
                  className="shrink-0 cursor-pointer rounded px-2 py-1 text-[12px] text-ink-muted hover:text-red"
                >
                  ✕
                </button>
              </div>

              {editing === song.id && song.bpm !== null && (
                <BpmEditor song={song} onSave={(value) => void saveBpm(song.id, value)} />
              )}
            </li>
          )
        })}
      </ul>

      {songs.length === 0 && (
        <p className="text-[13px] text-ink-muted">
          Todavía no hay canciones. Procesar una es de una sola vez: después queda guardada.
        </p>
      )}

      <p className="text-[12px] text-ink-muted">
        Procesar descarga el audio y detecta el tempo. El tempo es la velocidad: la barra
        cruza un compás de cuatro beats, así que más BPM es barra más rápida. Se admiten
        canciones de <b className="text-ink-soft">1 a 10 minutos</b>.
      </p>
    </div>
  )
}

/**
 * Corrección manual del tempo.
 *
 * El detectado se muestra siempre y no se pierde: la corrección es un valor
 * aparte, así que volver a la medición no obliga a reprocesar la canción.
 */
function BpmEditor({
  song,
  onSave,
}: {
  song: SongStatus
  onSave: (bpm: number | null) => void
}) {
  const detected = song.bpm ?? 120
  const [min, max] = song.bpmRange ?? [40, 240]
  const [value, setValue] = useState(String(Math.round(song.bpmOverride ?? detected)))

  const parsed = Number(value)
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-night/60 px-3 py-2 text-[12px]">
      <span className="text-ink-muted">
        Detectado <b className="text-gold">{Math.round(detected)}</b> · recomendado{' '}
        {Math.round(min)}–{Math.round(max)}
      </span>

      <input
        type="number"
        value={value}
        min={Math.round(min)}
        max={Math.round(max)}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 rounded border-2 border-line bg-sunken px-2 py-1 text-center text-ink outline-none focus:border-cyan"
      />

      <button
        onClick={() => onSave(parsed)}
        disabled={!valid}
        className="cursor-pointer rounded bg-cyan/20 px-3 py-1 font-bold text-cyan disabled:cursor-not-allowed disabled:opacity-40"
      >
        GUARDAR
      </button>

      {song.bpmOverride !== null && (
        <button
          onClick={() => onSave(null)}
          className="cursor-pointer rounded px-2 py-1 text-ink-muted hover:text-ink"
        >
          Volver al detectado
        </button>
      )}

      <span className="basis-full text-ink-muted">
        {valid ? (
          <>
            La barra tarda{' '}
            <b className="text-cyan">{(measureDurationMs(parsed) / 1000).toFixed(2)} s</b> en
            cruzar un compás. <b className="text-gold">Más BPM, barra más rápida.</b> Es la
            única perilla de velocidad.
          </>
        ) : (
          <>Fuera del rango recomendado.</>
        )}
      </span>

      <span className="basis-full text-ink-muted">
        Si el juego va al doble o a la mitad de velocidad de lo que escuchas, prueba con la
        mitad o el doble del detectado: es el error típico de la detección.
      </span>
    </div>
  )
}
