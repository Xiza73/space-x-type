import { useEffect, useState } from 'react'

import {
  deleteSong,
  formatDuration,
  listSongs,
  processSong,
  type SongStatus,
} from '../library/client'

type Props = {
  /** Canción elegida, o `null` para el chiptune simulado. */
  selected: string | null
  onSelect: (id: string | null) => void
}

export function SongLibrary({ selected, onSelect }: Props) {
  const [songs, setSongs] = useState<SongStatus[]>([])
  const [url, setUrl] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    try {
      setSongs(await listSongs())
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
      if (selected === id) onSelect(null)
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
          placeholder="Pegá una URL de YouTube"
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
          Bajando y analizando. Puede tardar bastante en canciones largas.
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
            <span className="ml-2 text-[12px] text-ink-muted">velocidad a elección</span>
          </button>
        </li>

        {songs.map((song) => {
          const playable = song.intact && song.bpm !== null
          return (
            <li key={song.id} className="flex items-center gap-2">
              <button
                onClick={() => playable && onSelect(song.id)}
                aria-pressed={selected === song.id}
                disabled={!playable}
                className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                  selected === song.id ? 'bg-cyan/20 text-cyan' : 'bg-sunken'
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
                  ) : song.bpm === null ? (
                    <span className="text-ink-muted">SIN ANALIZAR</span>
                  ) : (
                    <span className="text-gold">{Math.round(song.bpm)} BPM</span>
                  )}
                </span>
              </button>
              <button
                onClick={() => void remove(song.id)}
                aria-label={`Borrar ${song.title}`}
                className="shrink-0 cursor-pointer rounded px-2 py-1 text-[12px] text-ink-muted hover:text-red"
              >
                ✕
              </button>
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
        Procesar baja el audio y detecta el tempo. Con una canción elegida, el tempo y el
        largo de la partida los pone el beatmap.
      </p>
    </div>
  )
}
