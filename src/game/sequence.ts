import { ROUND } from './constants'

/**
 * Un paso de la secuencia: qué hay que presionar y qué se dibuja.
 *
 * `key` es un token ya normalizado, no una tecla cruda del teclado.
 * Gracias a eso el motor compara sin saber si está jugando flechas o palabras.
 */
export type Step = {
  key: string
  glyph: string
}

export const ARROWS = [
  { key: 'ArrowLeft', glyph: '←' },
  { key: 'ArrowUp', glyph: '↑' },
  { key: 'ArrowDown', glyph: '↓' },
  { key: 'ArrowRight', glyph: '→' },
] as const satisfies readonly Step[]

export type ArrowKey = (typeof ARROWS)[number]['key']

const ARROW_KEYS: ReadonlySet<string> = new Set(ARROWS.map((a) => a.key))

/**
 * Traduce una tecla cruda del teclado al token que guardan los `Step`.
 * Devuelve `null` si la tecla no participa del juego — el motor la ignora
 * en vez de contarla como error.
 *
 * Una sola función para los dos modos: las flechas viajan tal cual y las
 * letras se normalizan a mayúscula. El motor nunca pregunta en qué modo está.
 */
export function normalizeKey(raw: string): string | null {
  if (ARROW_KEYS.has(raw)) return raw
  if (raw.length === 1 && /[a-zA-Z]/.test(raw)) return raw.toUpperCase()
  return null
}

/**
 * Genera una secuencia de flechas al azar.
 *
 * `random` se inyecta para poder testear: un test que dependa de `Math.random`
 * es un test que falla solo algún día.
 */
export function makeArrowSequence(
  length: number = ROUND.arrowCount,
  random: () => number = Math.random,
): Step[] {
  return Array.from({ length }, () => {
    // El clamp cubre un `random` inyectado que devuelva exactamente 1.
    const i = Math.min(ARROWS.length - 1, Math.floor(random() * ARROWS.length))
    return ARROWS[i]
  })
}
