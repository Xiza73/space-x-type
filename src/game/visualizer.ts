/**
 * Visualizador circular: una figura en el centro y barras de sonido saliendo
 * de secciones del anillo.
 *
 * Reemplaza al campo de luces, que tenía un defecto de raíz: agrupaba todo en
 * tres bandas, así que **todas las luces de un grupo se prendían juntas**. Era
 * un latido, no un espectro. Aquí cada barra tiene su propia banda de
 * frecuencia, así que moverse todas igual es imposible por construcción.
 *
 * Cada canción recibe una figura del catálogo según su id, no al azar: la misma
 * canción se ve siempre igual —eso le da identidad— y dos canciones distintas
 * casi nunca coinciden.
 *
 * El módulo no toca Web Audio: recibe el espectro como dato. Por eso se testea
 * sin fingir un `AudioContext`.
 */

import { COLORS } from '../theme/tokens'

/** Barras alrededor del anillo. Una banda de frecuencia cada una. */
export const BAR_COUNT = 96

/**
 * Cuánto conserva una barra por segundo al caer.
 *
 * Ataque instantáneo y caída lenta: la barra marca el golpe y baja sola. Sin
 * caída propia el anillo tiembla con el ruido de fondo del análisis.
 */
const DECAY_PER_SEC = 0.02

/** Radio de la figura, sobre el lado menor del canvas. */
const FIGURE_RADIUS = 0.15
/** Hasta dónde llega una barra a nivel máximo, en radios de figura. */
const BAR_REACH = 0.95

export type Visualizer = {
  update(spectrum: Float32Array, dtMs: number): void
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void
  /** Solo para tests. */
  levels(): Float32Array
  styleId(): string
}

/** Un tramo del anillo donde hay barras, en grados. El resto queda limpio. */
type Arc = readonly [number, number]

type Style = {
  id: string
  /** Acentos de las barras: la de adentro y la de la punta. */
  from: string
  to: string
  arcs: readonly Arc[]
  figure: (ctx: CanvasRenderingContext2D, r: number, level: number) => void
}

/**
 * El catálogo. Todas las figuras son circulares y se dibujan con primitivas de
 * canvas: el proyecto no lleva assets, y una imagen por figura sería un archivo
 * que hay que versionar, cargar y mantener a tono con la paleta.
 *
 * Los tramos del anillo no son decorativos. Una figura con auriculares deja
 * libre donde van las orejeras; el casco deja libre el visor. Las barras salen
 * de donde la figura no está.
 */
const STYLES: readonly Style[] = [
  {
    id: 'vinilo',
    from: COLORS.magenta,
    to: COLORS.gold,
    arcs: [[0, 360]],
    figure: (ctx, r, level) => {
      disc(ctx, r, '#1a1a24', '#0d0d14')
      ctx.strokeStyle = withAlpha(COLORS.inkMuted, 0.25)
      ctx.lineWidth = 1
      for (let i = 3; i <= 7; i++) {
        ctx.beginPath()
        ctx.arc(0, 0, (r * i) / 8, 0, Math.PI * 2)
        ctx.stroke()
      }
      // La etiqueta late con el nivel: es el "cuerpo" del tema.
      ctx.fillStyle = COLORS.magenta
      ctx.beginPath()
      ctx.arc(0, 0, r * (0.3 + level * 0.06), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = COLORS.night
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.05, 0, Math.PI * 2)
      ctx.fill()
    },
  },
  {
    id: 'auriculares',
    from: COLORS.cyan,
    to: COLORS.magentaLight,
    // Libre arriba, donde va la diadema, y a los costados de las orejeras.
    arcs: [
      [30, 150],
      [210, 330],
    ],
    figure: (ctx, r, level) => {
      disc(ctx, r, '#232336', '#15151f')
      ctx.strokeStyle = COLORS.cyan
      ctx.lineWidth = r * 0.1
      ctx.lineCap = 'round'
      // Diadema.
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.72, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
      // Orejeras, que se inflan con el sonido.
      const cup = r * (0.26 + level * 0.05)
      ctx.fillStyle = COLORS.cyan
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.ellipse(side * r * 0.72, r * 0.1, cup * 0.55, cup, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      // Cara mínima: dos ojos. Sin boca — una boca fija se ve muerta.
      ctx.fillStyle = COLORS.ink
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(side * r * 0.24, -r * 0.05, r * 0.07, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  {
    id: 'casco',
    from: COLORS.gold,
    to: COLORS.flare,
    // Libre abajo y arriba: el visor ocupa el frente.
    arcs: [[200, 340]],
    figure: (ctx, r, level) => {
      disc(ctx, r, '#2a2a3d', '#161620')
      // Visor: elipse con reflejo, como un casco espacial.
      const visor = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.4)
      visor.addColorStop(0, withAlpha(COLORS.flare, 0.55 + level * 0.35))
      visor.addColorStop(1, withAlpha(COLORS.cyan, 0.15))
      ctx.fillStyle = visor
      ctx.beginPath()
      ctx.ellipse(0, -r * 0.05, r * 0.62, r * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = withAlpha(COLORS.gold, 0.8)
      ctx.lineWidth = r * 0.05
      ctx.stroke()

      // Arco de reflejo arriba a la izquierda, igual que en las casillas.
      ctx.strokeStyle = withAlpha('#ffffff', 0.35)
      ctx.lineWidth = r * 0.04
      ctx.beginPath()
      ctx.arc(0, -r * 0.05, r * 0.45, Math.PI * 1.15, Math.PI * 1.6)
      ctx.stroke()
    },
  },
  {
    id: 'nucleo',
    from: COLORS.purple,
    to: COLORS.cyan,
    // Tres tramos con huecos: las barras salen "por secciones".
    arcs: [
      [0, 100],
      [130, 230],
      [260, 340],
    ],
    figure: (ctx, r, level) => {
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
      glow.addColorStop(0, withAlpha(COLORS.cyan, 0.7 + level * 0.3))
      glow.addColorStop(0.55, withAlpha(COLORS.purple, 0.4))
      glow.addColorStop(1, withAlpha(COLORS.purple, 0))
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = withAlpha(COLORS.cyan, 0.5)
      ctx.lineWidth = 2
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath()
        ctx.arc(0, 0, r * (0.3 + i * 0.2) * (1 + level * 0.08), 0, Math.PI * 2)
        ctx.stroke()
      }
    },
  },
]

/**
 * Arma el visualizador de una partida.
 *
 * `seed` sale del id de la canción, así que la figura es **estable por
 * canción**: la misma canción se ve siempre igual y eso le da identidad, en vez
 * de sortear una distinta cada vez que se juega.
 */
export function createVisualizer(seed: number): Visualizer {
  const style = STYLES[Math.abs(Math.trunc(seed)) % STYLES.length]
  const levels = new Float32Array(BAR_COUNT)

  // Qué barras caen dentro de algún tramo del anillo. Se calcula una vez: es
  // fijo para toda la partida y preguntarlo por barra y por frame es tirar
  // trabajo a la basura.
  const visible = Array.from({ length: BAR_COUNT }, (_, i) => {
    const deg = (i / BAR_COUNT) * 360
    return style.arcs.some(([from, to]) => deg >= from && deg <= to)
  })

  return {
    update(spectrum: Float32Array, dtMs: number): void {
      const keep = DECAY_PER_SEC ** (dtMs / 1000)
      for (let i = 0; i < BAR_COUNT; i++) {
        levels[i] = Math.max(spectrum[i] ?? 0, levels[i] * keep)
      }
    },

    draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
      const unit = Math.min(w, h)
      const radius = unit * FIGURE_RADIUS
      const cx = w / 2
      const cy = h * 0.4

      // El nivel general mueve la figura. Sale de los graves —el primer cuarto
      // del espectro—, que es lo que se siente como "el golpe".
      let body = 0
      const bassBars = Math.floor(BAR_COUNT / 4)
      for (let i = 0; i < bassBars; i++) body += levels[i]
      body /= bassBars

      ctx.save()
      ctx.translate(cx, cy)

      ctx.save()
      style.figure(ctx, radius, body)
      ctx.restore()

      // Aditivo: donde dos barras se cruzan el color se suma, como una luz.
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(2, (Math.PI * 2 * radius) / BAR_COUNT / 2)

      const inner = radius * 1.08
      const reach = radius * BAR_REACH

      // **Un solo gradiente para las 96 barras.** Se define hacia arriba y son
      // las barras las que giran debajo de él: un gradiente de canvas se pinta
      // con la transformación vigente, así que rota junto con el trazo.
      //
      // Armarlo por barra y por frame costaba 0.685 ms —96 gradientes nuevos
      // cada 16 ms—, contra 0.09 ms así. Es el mismo error que este archivo
      // advierte de no cometer, y lo cometí igual la primera vez.
      const gradient = ctx.createLinearGradient(0, -inner, 0, -(inner + reach))
      gradient.addColorStop(0, withAlpha(style.from, 0.85))
      gradient.addColorStop(1, withAlpha(style.to, 0.15))
      ctx.strokeStyle = gradient

      // Se gira de a un paso y se restaura una sola vez al final, en vez de un
      // save/restore por barra.
      const step = (Math.PI * 2) / BAR_COUNT
      for (let i = 0; i < BAR_COUNT; i++, ctx.rotate(step)) {
        if (!visible[i]) continue
        const level = levels[i]
        if (level < 0.01) continue

        ctx.beginPath()
        ctx.moveTo(0, -inner)
        ctx.lineTo(0, -(inner + reach * level))
        ctx.stroke()
      }

      ctx.restore()
    },

    levels: () => levels,
    styleId: () => style.id,
  }
}

/** Hash estable de un texto. Sirve para que cada canción caiga en su figura. */
export function seedFrom(text: string): number {
  let hash = 2_166_136_261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function disc(ctx: CanvasRenderingContext2D, r: number, top: string, bottom: string): void {
  // El foco arriba a la izquierda y no en el centro: un gradiente centrado se
  // ve plano por más colores que se le pongan. Misma regla que las casillas.
  const fill = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r)
  fill.addColorStop(0, top)
  fill.addColorStop(1, bottom)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
}

function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}
