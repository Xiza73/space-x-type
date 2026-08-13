type Props = {
  /** Segundos que faltan. `0` muestra el "¡YA!" antes de arrancar. */
  value: number
  title?: string
}

/**
 * Cuenta regresiva de arranque y de reanudación.
 *
 * Corre con reloj de pared y no con el del juego: mientras cuenta, el contexto
 * de audio está suspendido y `nowMs()` está congelado, así que el reloj del
 * juego no podría contarla ni aunque quisiera.
 */
export function Countdown({ value, title }: Props) {
  return (
    <div className="fixed inset-0 grid place-content-center justify-items-center gap-4 bg-night/92 text-center">
      {title !== undefined && (
        <p className="text-[11px] font-bold tracking-[6px] text-ink-muted">{title}</p>
      )}
      <p
        key={value}
        className="font-display text-8xl leading-none text-flare"
        style={{ animation: 'countpop .9s ease-out' }}
      >
        {value > 0 ? value : '¡YA!'}
      </p>
    </div>
  )
}
