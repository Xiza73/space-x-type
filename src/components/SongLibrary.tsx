import { useEffect, useState } from 'react'

import { BPM_LIMITS, measureDurationMs } from '../game/constants'
import { Modal } from './Modal'
import { SongPicker } from './SongPicker'
import {
  deleteSong,
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
  // Qué canción se está por borrar. Borrar toca el disco y no tiene deshacer,
  // así que un click de más no puede alcanzar.
  const [confirming, setConfirming] = useState<SongStatus | null>(null)
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
    setConfirming(null)
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

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SongPicker songs={songs} selected={selected} onSelect={onSelect} />
        </div>

        {/*
          Las acciones son de la canción **elegida**, no de cada fila. Con la
          lista abierta había un par de botones por canción; en un combo eso no
          entra, y tampoco hace falta: se ajusta o se borra lo que se está por
          jugar.
        */}
        {selected !== null && (
          <>
            {selected.bpm !== null && (
              <button
                onClick={() => setEditing(editing === selected.id ? null : selected.id)}
                aria-label={`Ajustar tempo de ${selected.title}`}
                aria-expanded={editing === selected.id}
                className="shrink-0 cursor-pointer rounded-lg border-2 border-line px-3 py-2.5 text-[13px] text-ink-muted hover:border-cyan hover:text-cyan"
              >
                ♪
              </button>
            )}
            <button
              onClick={() => setConfirming(selected)}
              aria-label={`Eliminar ${selected.title}`}
              className="shrink-0 cursor-pointer rounded-lg border-2 border-line px-3 py-2.5 text-[13px] text-ink-muted hover:border-red hover:text-red"
            >
              ✕
            </button>
          </>
        )}
      </div>

      {selected !== null && editing === selected.id && selected.bpm !== null && (
        <BpmEditor
          // La `key` incluye el tempo guardado a propósito: al volver al
          // detectado, el componente se remonta y el campo vuelve a leer el
          // valor real. Sin esto el estado interno del input quedaba con el
          // número viejo aunque la canción ya tuviera otro.
          key={`${selected.id}-${selected.bpmOverride ?? 'detectado'}`}
          song={selected}
          onSave={(value) => void saveBpm(selected.id, value)}
        />
      )}

      <p className="text-[12px] text-ink-muted">
        El tempo es la velocidad. Canciones de{' '}
        <b className="text-ink-soft">1 a 10 minutos</b>.
      </p>

      <Modal
        open={confirming !== null}
        title="BORRAR CANCIÓN"
        onClose={() => setConfirming(null)}
      >
        <p className="max-w-[380px] text-[13px] text-ink-soft">
          Se borra <b className="text-ink">{confirming?.title}</b> del disco: el audio y su
          análisis. Volver a tenerla es procesar la URL de nuevo.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={() => setConfirming(null)}
            className="cursor-pointer rounded-lg border-2 border-line px-4 py-2 text-sm font-bold text-ink-soft hover:border-ink-muted"
          >
            CANCELAR
          </button>
          <button
            onClick={() => confirming !== null && void remove(confirming.id)}
            className="cursor-pointer rounded-lg bg-red/20 px-4 py-2 text-sm font-bold text-red hover:bg-red/30"
          >
            BORRAR
          </button>
        </div>
      </Modal>
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
  const [min, max] = song.bpmRange ?? [BPM_LIMITS.min, BPM_LIMITS.max]
  const [value, setValue] = useState(String(Math.round(song.bpmOverride ?? detected)))

  const parsed = Number(value)
  // Se mide contra los límites **duros**, no contra el sugerido. El sugerido
  // cubre el error de octava, que es el fallo típico, pero no es la única razón
  // para tocar el tempo: se puede querer jugar una balada al doble. Sugerir no
  // es prohibir.
  const valid =
    Number.isFinite(parsed) && parsed >= BPM_LIMITS.min && parsed <= BPM_LIMITS.max
  const fueraDelSugerido = valid && (parsed < min || parsed > max)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-night/60 px-3 py-2 text-[12px]">
      <span className="text-ink-muted">
        Detectado <b className="text-gold">{Math.round(detected)}</b> · recomendado{' '}
        {Math.round(min)}–{Math.round(max)}
      </span>

      <input
        type="number"
        value={value}
        min={BPM_LIMITS.min}
        max={BPM_LIMITS.max}
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
            cruzar un compás. <b className="text-gold">Más BPM, barra más rápida.</b>
            {fueraDelSugerido && (
              <span className="text-gold"> Fuera del rango sugerido, pero se guarda igual.</span>
            )}
          </>
        ) : (
          <>
            El tempo va de {BPM_LIMITS.min} a {BPM_LIMITS.max}.
          </>
        )}
      </span>

      <span className="basis-full text-ink-muted">
        Si el juego va al doble o a la mitad de velocidad de lo que escuchas, prueba con la
        mitad o el doble del detectado: es el error típico de la detección.
      </span>
    </div>
  )
}
