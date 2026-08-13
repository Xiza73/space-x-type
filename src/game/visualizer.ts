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

/**
 * Barras alrededor del anillo. Una banda de frecuencia cada una.
 *
 * Bajó de 96 a 72 para que cada barra sea más gruesa sin que se separen: con la
 * circunferencia fija, menos barras y más ancho de trazo dan un anillo más
 * sólido. 72 sigue siendo resolución de sobra para el espectro.
 */
export const BAR_COUNT = 72

/**
 * Nivel por debajo del cual una barra directamente no se dibuja.
 *
 * **El estado base de la figura es sin barras.** Sin este umbral el ruido de
 * fondo del análisis mantenía todo el anillo levantado a media asta, así que la
 * figura nunca se veía limpia y las barras no se leían como una reacción a algo
 * sino como decoración permanente.
 */
export const BAR_GATE = 0.45

/** Qué fracción del espacio entre barras ocupa el trazo. */
const BAR_DUTY = 0.8

/**
 * Cuánto conserva una barra por segundo al caer.
 *
 * Ataque instantáneo y caída lenta: la barra marca el golpe y baja sola. Sin
 * caída propia el anillo tiembla con el ruido de fondo del análisis.
 */
const DECAY_PER_SEC = 0.02

/** Radio de la figura, sobre el lado menor del canvas. */
const FIGURE_RADIUS = 0.13
/** Hasta dónde llega una barra a nivel máximo, en radios de figura. */
const BAR_REACH = 0.8
/** Centro de la figura, sobre el alto. Arriba del área de juego. */
const FIGURE_Y = 0.33

export type Visualizer = {
  update(spectrum: Float32Array, dtMs: number): void
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void
  /** Solo para tests. */
  levels(): Float32Array
  styleId(): string
  /** Qué posiciones del anillo dibuja esta figura. Solo para tests. */
  visibleBars(): readonly boolean[]
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
export const STYLE_COUNT = 4

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
    // Libre arriba y abajo, con barras a los dos costados.
    //
    // Antes era un solo tramo `[200, 340]`, o sea **todo el lado izquierdo y
    // nada del derecho**: en pantalla se leía como que el visualizador estaba
    // roto. Un tramo suelto no es un diseño asimétrico, es un error.
    arcs: [
      [20, 160],
      [200, 340],
    ],
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
  const random = lcg(seed || 1)
  const style = STYLES[Math.abs(Math.trunc(seed)) % STYLES.length]
  const levels = new Float32Array(BAR_COUNT)
  let body = 0

  // Qué barras caen dentro de algún tramo del anillo. Se calcula una vez: es
  // fijo para toda la partida y preguntarlo por barra y por frame es tirar
  // trabajo a la basura.
  const visible = Array.from({ length: BAR_COUNT }, (_, i) => {
    const deg = (i / BAR_COUNT) * 360
    return style.arcs.some(([from, to]) => deg >= from && deg <= to)
  })

  // Qué banda mira cada posición del anillo, **mezclado**.
  //
  // Sin mezclar, las frecuencias quedan ordenadas alrededor del círculo y un
  // golpe de bombo levanta un solo sector: se ve como una aguja girando, no
  // como una reacción. Mezclado, un sonido enciende posiciones dispersas, que
  // es lo que hace el efecto en los videos musicales.
  //
  // La mezcla va con semilla, así que cada canción tiene su reparto y siempre
  // el mismo.
  const order = shuffle(
    Array.from({ length: BAR_COUNT }, (_, i) => i),
    random,
  )

  return {
    update(spectrum: Float32Array, dtMs: number): void {
      const keep = DECAY_PER_SEC ** (dtMs / 1000)

      for (let i = 0; i < BAR_COUNT; i++) {
        const raw = spectrum[order[i]] ?? 0
        // La compuerta va aquí y no al dibujar: así el nivel arranca en cero y
        // decae desde el golpe, en vez de quedar flotando bajo el umbral.
        const gated = raw >= BAR_GATE ? raw : 0
        levels[i] = Math.max(gated, levels[i] * keep)
      }

      // El cuerpo de la figura sale de los graves **sin mezclar**: la mezcla es
      // para las posiciones del anillo, no para lo que significa cada banda.
      const bassBands = Math.max(1, Math.floor(spectrum.length / 5))
      let bass = 0
      for (let i = 0; i < bassBands; i++) bass += spectrum[i]
      body = Math.max(bass / bassBands, body * keep)
    },

    draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
      const unit = Math.min(w, h)
      const radius = unit * FIGURE_RADIUS
      const cx = w / 2
      const cy = h * FIGURE_Y

      ctx.save()
      ctx.translate(cx, cy)

      ctx.save()
      style.figure(ctx, radius, body)
      ctx.restore()

      // Aditivo: donde dos barras se cruzan el color se suma, como una luz.
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'
      // Ancho de trazo casi igual al espacio entre barras: gruesas y pegadas,
      // no palitos sueltos.
      ctx.lineWidth = Math.max(3, ((Math.PI * 2 * radius) / BAR_COUNT) * BAR_DUTY)

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
    visibleBars: () => visible,
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

/**
 * Generador congruencial lineal. Alcanza de sobra para repartir bandas por el
 * anillo, y a diferencia de `Math.random` se puede fijar en un test.
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

/** Fisher-Yates. Devuelve el mismo arreglo, mezclado en el lugar. */
function shuffle(items: number[], random: () => number): number[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
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
