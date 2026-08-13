import { useEffect, useId, useRef, useState } from 'react'

import { effectiveBpm, formatDuration, type SongStatus } from '../library/client'

type Props = {
  songs: readonly SongStatus[]
  selected: SongStatus | null
  onSelect: (song: SongStatus | null) => void
}

/** La opción que no es una canción: el chiptune generado. */
const CHIPTUNE = 'Chiptune simulado'

/**
 * Selector de canción con autocompletado.
 *
 * Antes la biblioteca era una lista abierta, y con ocho canciones ya empujaba el
 * botón de JUGAR fuera de la pantalla. Un combo ocupa una fila y no crece: la
 * altura del menú deja de depender de cuántas canciones tengas.
 *
 * Es un combo propio y no un `<select>` porque hace falta filtrar escribiendo, y
 * porque cada opción muestra duración y tempo además del título.
 */
export function SongPicker({ songs, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  // `null` es la primera opción: el chiptune. Va con las canciones en la misma
  // lista para que el teclado recorra todo sin casos especiales.
  const matches: (SongStatus | null)[] = [
    null,
    ...songs.filter((song) => song.title.toLowerCase().includes(query.trim().toLowerCase())),
  ].filter((option) => {
    if (option !== null || query.trim() === '') return true
    return CHIPTUNE.toLowerCase().includes(query.trim().toLowerCase())
  })

  // Un click afuera cierra. Sin esto el desplegable queda abierto tapando el
  // resto del menú, que es justo el problema que este componente viene a
  // resolver.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  function choose(option: SongStatus | null) {
    onSelect(option)
    close()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Las flechas mueven la selección del desplegable, no el cursor del
      // texto ni el foco de la página.
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter') {
      // Con el desplegable abierto ENTER elige; cerrado, deja que el menú lo
      // use para empezar la partida.
      if (!open) return
      event.preventDefault()
      event.stopPropagation()
      const option = matches[active]
      if (option === undefined) return
      if (option !== null && !playable(option)) return
      choose(option)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label="Canción"
        value={open ? query : label(selected)}
        placeholder={open ? label(selected) : undefined}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        className="w-full cursor-pointer rounded-lg border-2 border-line bg-sunken px-3 py-2.5 text-sm text-ink outline-none focus:border-cyan"
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-[280px] w-full overflow-y-auto rounded-lg border-2 border-line bg-surface-deep py-1 shadow-[0_12px_30px_rgb(0_0_0/0.55)]"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-ink-muted">Ninguna coincide.</li>
          )}

          {matches.map((option, i) => {
            const usable = option === null || playable(option)
            const isSelected =
              option === null ? selected === null : selected?.id === option.id

            return (
              <li
                key={option?.id ?? 'chiptune'}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={!usable}
                // `mousedown` y no `click`: el click llega después del blur, y
                // para entonces el desplegable ya se cerró.
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (usable) choose(option)
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-3 px-3 py-2 text-sm ${
                  i === active ? 'bg-cyan/15' : ''
                } ${usable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} ${
                  isSelected ? 'text-cyan' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate" title={option?.title ?? CHIPTUNE}>
                  {option?.title ?? CHIPTUNE}
                </span>
                {option === null ? (
                  <span className="shrink-0 text-[12px] text-ink-muted">tempo a elección</span>
                ) : (
                  <Meta song={option} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Una canción sin audio o sin tempo no se puede jugar. */
function playable(song: SongStatus): boolean {
  return song.intact && song.bpm !== null
}

function label(selected: SongStatus | null): string {
  return selected?.title ?? CHIPTUNE
}

function Meta({ song }: { song: SongStatus }) {
  const bpm = effectiveBpm(song)
  return (
    <>
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
    </>
  )
}
