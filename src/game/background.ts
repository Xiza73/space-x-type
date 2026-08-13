/**
 * Fondo reactivo: un campo de luces que se prenden con lo que suena.
 *
 * Reemplaza al plan original de poner el video de YouTube de fondo, y sale más
 * barato por tres lados: no agrega un solo byte al disco, funciona igual con el
 * chiptune que con una canción descargada, y no depende de que YouTube exista.
 *
 * También es más barato que el fondo psicodélico del prototipo, que usaba
 * `blur(34px) contrast(18)` a pantalla completa —el efecto que
 * `design-system.md` marca en rojo— animándose debajo de un juego que tiene que
 * sostener 60fps. Aquí no hay filtros: cada luz es un sprite de gradiente
 * radial pre-renderizado **una vez**, y por frame solo se hace `drawImage`.
 *
 * El módulo es puro respecto del audio: recibe las bandas como dato y no sabe
 * de dónde salieron. Por eso se testea sin Web Audio.
 */

import type { Bands } from '../audio/bands'
import { COLORS } from '../theme/tokens'

/** Cuántas luces. Medido: con más de ~20 el `drawImage` empieza a pesar. */
const LIGHT_COUNT = 14

/**
 * Cuánto de su brillo conserva una luz por segundo.
 *
 * El ataque es instantáneo y la caída lenta: así una luz **marca** el golpe y
 * después se apaga sola. Con caída rápida el fondo tiembla y marea; con caída
 * lenta se vuelve una mancha fija que no dice nada.
 */
const DECAY_PER_SEC = 0.06

/** Piso de brillo. Sin esto el fondo desaparece del todo en los silencios. */
const FLOOR = 0.08

const SPRITE_SIZE = 128

type Band = keyof Bands

type Light = {
  /** Posición relativa, 0–1. Se escala al tamaño real en cada `draw`. */
  x: number
  y: number
  /** Radio relativo al lado menor del canvas. */
  radius: number
  band: Band
  color: string
  level: number
}

export type LightField = {
  /** Avanza el brillo de cada luz. `dtMs` mantiene la caída independiente de los fps. */
  update(bands: Bands, dtMs: number): void
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void
  /** Solo para tests: el brillo actual de cada luz. */
  levels(): number[]
}

/**
 * Las luces caen en posiciones sorteadas, pero **fijas para toda la partida**.
 *
 * Sortearlas por frame haría que el fondo hierva y sería imposible de mirar; el
 * pedido era que se prendan en lugares aleatorios, no que se muevan.
 *
 * El sorteo usa un generador con semilla y no `Math.random` para que un test
 * pueda fijar el resultado. Además `Math.random` en un módulo que corre dentro
 * del loop es la clase de cosa que después hace un test intermitente.
 */
export function createLightField(seed = 1): LightField {
  const random = lcg(seed)
  const bands: Band[] = ['bass', 'mid', 'treble']
  const palette: Record<Band, string[]> = {
    bass: [COLORS.magenta, COLORS.purple],
    mid: [COLORS.cyan, COLORS.magentaLight],
    treble: [COLORS.gold, COLORS.flare],
  }

  const lights: Light[] = Array.from({ length: LIGHT_COUNT }, (_, i) => {
    // Repartidas por banda en vez de sorteadas: con sorteo puro puede tocar que
    // los graves no tengan ninguna luz y el bombo quede mudo en pantalla.
    const band = bands[i % bands.length]
    const colors = palette[band]
    return {
      x: random(),
      y: random(),
      // Los graves ocupan más lugar que los agudos, igual que se sienten.
      radius: (band === 'bass' ? 0.22 : band === 'mid' ? 0.15 : 0.09) * (0.7 + random() * 0.6),
      band,
      color: colors[Math.floor(random() * colors.length)],
      level: 0,
    }
  })

  const sprites = new Map<string, HTMLCanvasElement>()

  return {
    update(input: Bands, dtMs: number): void {
      // Ataque instantáneo, caída exponencial por tiempo real. Si la caída
      // fuera por frame, el fondo se apagaría al doble de velocidad en un
      // monitor de 120Hz.
      const keep = DECAY_PER_SEC ** (dtMs / 1000)
      for (const light of lights) {
        light.level = Math.max(input[light.band], light.level * keep)
      }
    },

    draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
      const unit = Math.min(w, h)

      ctx.save()
      // Aditivo: donde dos luces se cruzan el color se suma en vez de taparse,
      // que es como se comportan las luces de verdad.
      ctx.globalCompositeOperation = 'lighter'

      for (const light of lights) {
        const sprite = spriteFor(sprites, light.color)
        const size = light.radius * unit * (1 + light.level * 0.5)
        ctx.globalAlpha = FLOOR + light.level * 0.5
        ctx.drawImage(sprite, light.x * w - size, light.y * h - size, size * 2, size * 2)
      }

      ctx.restore()
    },

    levels: () => lights.map((l) => l.level),
  }
}

/**
 * Un sprite por color, creado la primera vez que se usa.
 *
 * Este es el truco que hace barato al fondo: el gradiente radial se calcula una
 * vez y después cada frame solo escala un bitmap ya hecho. Armar el gradiente
 * por luz y por frame es lo que vuelve lento a este tipo de efecto.
 */
function spriteFor(cache: Map<string, HTMLCanvasElement>, color: string): HTMLCanvasElement {
  const cached = cache.get(color)
  if (cached !== undefined) return cached

  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_SIZE
  canvas.height = SPRITE_SIZE

  const ctx = canvas.getContext('2d')
  if (ctx !== null) {
    const half = SPRITE_SIZE / 2
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
    gradient.addColorStop(0, color)
    gradient.addColorStop(0.45, withAlpha(color, 0.35))
    gradient.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  }

  cache.set(color, canvas)
  return canvas
}

function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Generador congruencial lineal. Alcanza de sobra para repartir luces por la
 * pantalla, y a diferencia de `Math.random` se puede fijar en un test.
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}
