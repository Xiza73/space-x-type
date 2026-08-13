import { WORDS_EN } from '../data/words/en'
import { WORDS_ES } from '../data/words/es'
import { ROUND } from './constants'

/**
 * Un paso de la secuencia: qué hay que presionar y qué se dibuja.
 *
 * `key` es un token ya normalizado, no una tecla cruda del teclado.
 * Gracias a eso el motor compara sin saber si está jugando flechas o palabras.
 */
export type ArrowDirection = 'left' | 'up' | 'down' | 'right'

export type Step = {
  key: string
  glyph: string
  /**
   * Si está presente, el paso se dibuja como una flecha vectorial en vez de
   * texto. No es capricho: el subconjunto `latin` de Bungee tiene `↑` y `↓`
   * pero NO `←` ni `→`, así que dibujarlas como glifos daría dos tipografías
   * distintas en la misma fila, y cuál depende del sistema operativo.
   */
  dir?: ArrowDirection
}

export const ARROWS = [
  { key: 'ArrowLeft', glyph: '←', dir: 'left' },
  { key: 'ArrowUp', glyph: '↑', dir: 'up' },
  { key: 'ArrowDown', glyph: '↓', dir: 'down' },
  { key: 'ArrowRight', glyph: '→', dir: 'right' },
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
  return Array.from({ length }, () => pick(ARROWS, random))
}

/**
 * Una palabra de `length` letras, partida letra por letra.
 *
 * Sin `dir`, así que el render las dibuja como texto en vez de vector. Esa es
 * toda la diferencia con las flechas del lado del dibujo.
 */
export function makeWordSequence(
  words: readonly string[],
  length: number,
  random: () => number = Math.random,
): Step[] {
  return [...pickOfLength(words, length, random)].map((char) => ({ key: char, glyph: char }))
}

/**
 * Palabra de la longitud pedida. Si no hay ninguna exacta, cae a la longitud
 * disponible más cercana en vez de reventar: las listas se editan a mano y un
 * hueco no puede tumbar la partida.
 *
 * Filtra en cada ronda a propósito: son ~110 palabras una vez cada par de
 * segundos. Indexar por longitud sería maquinaria para un costo que no existe.
 */
function pickOfLength(words: readonly string[], length: number, random: () => number): string {
  const exact = words.filter((w) => w.length === length)
  if (exact.length > 0) return pick(exact, random)

  const nearest = words.reduce((best, w) =>
    Math.abs(w.length - length) < Math.abs(best.length - length) ? w : best,
  )
  return pick(
    words.filter((w) => w.length === nearest.length),
    random,
  )
}

export type SequenceType = 'arrows' | 'words'
export type Language = 'es' | 'en'

const WORDS: Record<Language, readonly string[]> = { es: WORDS_ES, en: WORDS_EN }

/**
 * Arma el proveedor de secuencias del modo elegido.
 *
 * Este es el **eje 1** (qué se tipea) completo. Recibe cuántas teclas tiene que
 * producir, pero no sabe de dónde salió ese número: lo decide el eje 2. Si
 * alguna vez necesitas preguntar aquí por la fuente del ritmo, los ejes se
 * mezclaron.
 */
export function sequenceProvider(
  type: SequenceType,
  language: Language,
): (length: number) => Step[] {
  const make =
    type === 'arrows'
      ? (length: number) => makeArrowSequence(length)
      : (length: number) => makeWordSequence(WORDS[language], length)

  return withoutRecentRepeats(make)
}

/**
 * Cuántas rondas hacia atrás se recuerda una secuencia para no repetirla.
 *
 * Tres: repetir dentro de una tanda corta se lee como que el juego se colgó o
 * te está regalando la ronda. Más atrás no hace falta —cuando la curva vuelve a
 * ese largo, el jugador ya no se acuerda— y encima achicaría el repertorio.
 */
export const NO_REPEAT_WINDOW = 3

/**
 * Envuelve un generador para que no devuelva algo que ya salió hace poco.
 *
 * Reintenta un número **acotado** de veces y, si no encuentra otra, devuelve la
 * última que probó. Es deliberado: con 3 teclas hay 64 flechas posibles pero las
 * palabras de una longitud dada pueden ser pocas, y un bucle que insiste hasta
 * encontrar una distinta se cuelga el día que el repertorio es más chico que la
 * ventana. Un juego que se traba es peor que una repetición.
 */
function withoutRecentRepeats(
  make: (length: number) => Step[],
): (length: number) => Step[] {
  const recent: string[] = []

  return (length) => {
    let sequence = make(length)
    for (let i = 0; i < MAX_RETRIES && recent.includes(key(sequence)); i++) {
      sequence = make(length)
    }

    recent.push(key(sequence))
    if (recent.length > NO_REPEAT_WINDOW) recent.shift()
    return sequence
  }
}

const MAX_RETRIES = 12

/**
 * Identidad de una secuencia: la concatenación de sus **teclas**.
 *
 * `Step` es un objeto, así que un `join('')` a secas da `[object Object]` para
 * todas y la comparación deja de distinguir nada — silenciosamente, que es lo
 * peor. Aquí se rompió así la primera vez y el test lo agarró.
 */
const key = (sequence: readonly Step[]) => sequence.map((step) => step.key).join('')

/** El clamp cubre un `random` inyectado que devuelva exactamente 1. */
function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}
