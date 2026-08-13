type Option<T extends string> = {
  value: T
  label: string
  /**
   * Adorno delante del texto, más chico y apagado: el `←` de flechas, el `ABC`
   * de palabras. Va aparte y no pegado al label porque a tamaño completo un
   * prefijo de tres letras parte el botón en dos líneas, y eso estira el panel
   * entero y deja a los de al lado con un hueco vacío abajo.
   */
  prefix?: string
}

type Props<T extends string> = {
  label: string
  value: T
  options: readonly Option<T>[]
  accent: keyof typeof ACCENT
  onChange: (value: T) => void
}

/**
 * Las clases van completas en un mapa, no interpoladas (`border-${accent}`).
 * Tailwind extrae los nombres del código fuente: una clase armada en runtime
 * no existe en el CSS final.
 */
const ACCENT = {
  magenta: 'border-magenta bg-magenta/20 text-magenta',
  cyan: 'border-cyan bg-cyan/20 text-cyan',
} as const

const OFF = 'border-line bg-transparent text-ink-muted hover:border-ink-muted'

export function Toggle<T extends string>({ label, value, options, accent, onChange }: Props<T>) {
  return (
    <div className="flex min-w-[220px] flex-col gap-3 rounded-2xl border border-line-card bg-linear-to-b from-surface to-surface-deep px-5 py-4">
      <span className="text-[11px] font-bold tracking-[3px] text-ink-muted">{label}</span>

      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`flex flex-1 items-baseline justify-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition-colors duration-150 ${
              option.value === value ? ACCENT[accent] : OFF
            } cursor-pointer`}
          >
            {option.prefix !== undefined && (
              <span className="text-[10px] opacity-60">{option.prefix}</span>
            )}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
