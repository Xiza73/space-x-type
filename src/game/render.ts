import { COLORS, FONTS } from '../theme/tokens'
import { TIMING } from './constants'
import {
  multiplierFor,
  PERFECT_CENTER,
  progressAt,
  remainingMs,
  type GameState,
  type Judgement,
} from './engine'
import type { ArrowDirection } from './sequence'

const RAIL_MAX_W = 720
const RAIL_W_RATIO = 0.86
const RAIL_H = 48
const TILE = 66
const TILE_GAP = 12

export type Rect = { x: number; y: number; width: number; height: number }

/**
 * La geometría vive afuera de las funciones de dibujo, y a propósito: así se
 * testea la matemática de coordenadas sin fingir un canvas. Mockear
 * `CanvasRenderingContext2D` para verificar que llamaste a `fillRect` no prueba
 * que el juego se vea bien: prueba que escribiste el mock.
 */
export function railLayout(w: number, h: number): Rect {
  const width = Math.min(RAIL_MAX_W, w * RAIL_W_RATIO)
  return { x: w / 2 - width / 2, y: h * 0.62, width, height: RAIL_H }
}

/** Posición del marcador. Recorta fuera de `[0, 1]`: el progreso puede pasarse. */
export function markerX(rail: Rect, progress: number): number {
  return rail.x + Math.min(1, Math.max(0, progress)) * rail.width
}

/** Esquina superior izquierda de cada casilla de la secuencia. */
export function tileLayout(count: number, w: number, h: number): Rect[] {
  const totalW = count * TILE + (count - 1) * TILE_GAP
  const y = h * 0.42 - TILE / 2
  const startX = w / 2 - totalW / 2

  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * (TILE + TILE_GAP),
    y,
    width: TILE,
    height: TILE,
  }))
}

/** Texto Y color: un jugador daltónico tiene que poder distinguir la jugada. */
const JUDGEMENT_LABEL: Record<Judgement, { text: string; color: string }> = {
  perfect: { text: '¡PERFECT!', color: COLORS.gold },
  great: { text: 'GREAT', color: COLORS.magenta },
  good: { text: 'GOOD', color: COLORS.cyan },
  bad: { text: 'BAD', color: COLORS.purple },
  miss: { text: 'MISS', color: COLORS.red },
}

export function draw(canvas: HTMLCanvasElement, state: GameState, nowMs: number): void {
  const ctx = prepare(canvas)
  if (ctx === null) return

  const w = canvas.clientWidth
  const h = canvas.clientHeight

  ctx.fillStyle = COLORS.night
  ctx.fillRect(0, 0, w, h)

  // Terminada la partida el canvas queda vacío: la pantalla de resultados es
  // React, porque necesita un input de texto para el nombre.
  if (state.status === 'over') return

  drawHud(ctx, state, nowMs, w)
  drawFeedback(ctx, state, w, h)
  drawSequence(ctx, state, w, h)
  drawRail(ctx, state, nowMs, w, h)
}

/**
 * Ajusta el buffer del canvas al devicePixelRatio. Sin esto se ve borroso en
 * cualquier pantalla que no sea 1x.
 */
function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return null

  const dpr = globalThis.devicePixelRatio ?? 1
  const w = Math.round(canvas.clientWidth * dpr)
  const h = Math.round(canvas.clientHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  nowMs: number,
  w: number,
): void {
  const remaining = remainingMs(state, nowMs)
  const hasLives = state.config.lives !== null

  const cells: { label: string; value: string; color: string }[] = [
    { label: 'SCORE', value: String(state.score), color: COLORS.ink },
    { label: 'COMBO', value: String(state.combo), color: COLORS.magenta },
    { label: 'MULT', value: `x${multiplierFor(state.combo)}`, color: COLORS.cyan },
  ]

  // Cada modo muestra la palanca de dificultad que realmente se mueve: en
  // arcade el nivel (la velocidad), en canción la cantidad de teclas.
  if (remaining === null) {
    cells.push({ label: 'NIVEL', value: String(state.level), color: COLORS.gold })
  } else {
    cells.push({ label: 'TECLAS', value: String(state.sequence.length), color: COLORS.flare })
    cells.push({ label: 'TIEMPO', value: formatClock(remaining), color: COLORS.gold })
  }

  const slots = cells.length + (hasLives ? 1 : 0)
  const spacing = Math.min(150, (w - 80) / slots)
  let x = w / 2 - (spacing * (slots - 1)) / 2

  ctx.textAlign = 'center'
  for (const cell of cells) {
    label(ctx, cell.label, x, 40)
    ctx.textAlign = 'center'
    ctx.font = `700 30px ${FONTS.display}`
    ctx.fillStyle = cell.color
    ctx.fillText(cell.value, x, 74)
    x += spacing
  }

  if (hasLives) {
    label(ctx, 'VIDAS', x, 40)
    drawHearts(ctx, state, x, 74)
  }
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function drawHearts(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  centerX: number,
  y: number,
): void {
  const total = state.config.lives ?? 0
  ctx.font = `22px ${FONTS.ui}`
  ctx.textAlign = 'center'

  const step = 26
  const startX = centerX - ((total - 1) * step) / 2
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < state.lives ? COLORS.magenta : COLORS.lineMuted
    ctx.fillText('♥', startX + i * step, y)
  }
}

function drawFeedback(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
): void {
  if (state.status !== 'resolved' || state.lastJudgement === null) return

  const { text, color } = JUDGEMENT_LABEL[state.lastJudgement]
  ctx.textAlign = 'center'
  ctx.font = `700 44px ${FONTS.display}`
  ctx.fillStyle = color
  ctx.fillText(text, w / 2, h * 0.26)
}

function drawSequence(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
): void {
  const tiles = tileLayout(state.sequence.length, w, h)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  tiles.forEach((tile, i) => {
    const skin = i < state.index ? SKIN.done : i === state.index ? SKIN.current : SKIN.idle
    const r = tile.width / 2
    const cx = tile.x + r
    const cy = tile.y + r

    drawDisc(ctx, cx, cy, r, skin)

    const step = state.sequence[i]
    if (step.dir === undefined) {
      // Chakra Petch y no Bungee: Bungee es un display muy pesado y sus letras
      // sueltas se confunden entre sí. Acá la letra hay que leerla de un vistazo
      // y tipearla bien, así que manda la legibilidad.
      ctx.font = `700 34px ${FONTS.ui}`
      ctx.lineJoin = 'round'
      ctx.lineWidth = 6
      ctx.strokeStyle = skin.outline
      ctx.strokeText(step.glyph, cx, cy + 1)
      ctx.fillStyle = skin.fg
      ctx.fillText(step.glyph, cx, cy + 1)
    } else {
      drawArrow(ctx, step.dir, cx, cy, r * 1.05, skin)
    }
  })

  ctx.textBaseline = 'alphabetic'
}

type Skin = {
  top: string
  bottom: string
  ring: string
  glow: string | null
  fg: string
  outline: string
}

/**
 * Las tres pieles de una casilla. Redonda y con volumen en vez de un cuadrado
 * plano: el estilo arcade vive del brillo, y un rectángulo mate no lo tiene.
 */
const SKIN: Record<'done' | 'current' | 'idle', Skin> = {
  done: {
    top: COLORS.magentaLight,
    bottom: COLORS.magentaDark,
    ring: COLORS.flare,
    glow: COLORS.magenta,
    fg: COLORS.flare,
    outline: COLORS.magentaDark,
  },
  current: {
    top: COLORS.surface,
    bottom: COLORS.trackDeep,
    ring: COLORS.cyan,
    glow: COLORS.cyan,
    fg: COLORS.flare,
    outline: COLORS.night,
  },
  idle: {
    top: COLORS.tile,
    bottom: COLORS.trackDeep,
    ring: COLORS.line,
    glow: null,
    fg: COLORS.inkMuted,
    outline: COLORS.night,
  },
}

/** Disco con gradiente radial, anillo y un brillo arriba. */
function drawDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  skin: Skin,
): void {
  ctx.save()
  if (skin.glow !== null) {
    ctx.shadowColor = withAlpha(skin.glow, 0.75)
    ctx.shadowBlur = 20
  }
  // El foco arriba a la izquierda es lo que le da volumen: un gradiente
  // centrado se ve plano por más colores que le pongas.
  const fill = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.45, r * 0.1, cx, cy, r)
  fill.addColorStop(0, skin.top)
  fill.addColorStop(1, skin.bottom)

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2)
  ctx.lineWidth = 3
  ctx.strokeStyle = withAlpha(skin.ring, skin.glow === null ? 1 : 0.9)
  ctx.stroke()

  // Reflejo: un arco fino en la mitad de arriba.
  ctx.beginPath()
  ctx.arc(cx, cy, r - 5, Math.PI * 1.15, Math.PI * 1.85)
  ctx.lineWidth = 3
  ctx.strokeStyle = withAlpha(COLORS.flare, 0.22)
  ctx.stroke()
}

function drawRail(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  nowMs: number,
  w: number,
  h: number,
): void {
  const rail = railLayout(w, h)

  roundedRect(ctx, rail.x, rail.y, rail.width, rail.height, 12)
  ctx.fillStyle = COLORS.track
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = COLORS.line
  ctx.stroke()

  ctx.save()
  roundedRect(ctx, rail.x, rail.y, rail.width, rail.height, 12)
  ctx.clip()

  // Las zonas salen de TIMING: lo que ves es exactamente lo que puntúa.
  //
  // La información va en el BRILLO, no en el tono: blanco en el centro y se
  // apaga hacia los bordes. El ojo lee luminancia mucho más rápido que matiz,
  // y así el riel también le sirve a alguien daltónico.
  ctx.fillStyle = zoneGradient(ctx, rail)
  ctx.fillRect(rail.x, rail.y, rail.width, rail.height)

  if (state.status === 'round') {
    ctx.fillStyle = COLORS.magentaLight
    ctx.fillRect(markerX(rail, progressAt(state, nowMs)) - 2, rail.y, 4, rail.height)
  }
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.font = `700 12px ${FONTS.ui}`
  ctx.fillStyle = COLORS.inkMuted
  ctx.fillText('SECUENCIA  →  ESPACIO EN LA ZONA DORADA', w / 2, rail.y + rail.height + 28)
}

/**
 * Un degradado continuo en vez de bloques separados por ventana.
 *
 * Con cuatro ventanas anidadas, los rectángulos planos se ven como una torta de
 * capas y no comunican nada: el degradado se lee como un mapa de calor —cuanto
 * más brillante, más suma— que es exactamente lo que el jugador necesita saber.
 */
export function zoneGradient(ctx: CanvasRenderingContext2D, rail: Rect): CanvasGradient {
  const g = ctx.createLinearGradient(rail.x, 0, rail.x + rail.width, 0)

  // Los stops tienen que ir en orden creciente o el navegador tira error.
  g.addColorStop(0, withAlpha(COLORS.cyan, 0))
  g.addColorStop(TIMING.badStart, withAlpha(COLORS.cyan, 0))
  g.addColorStop(TIMING.goodStart, withAlpha(COLORS.cyan, 0.16))
  g.addColorStop(TIMING.greatStart, withAlpha(COLORS.cyan, 0.44))
  g.addColorStop(TIMING.perfectStart, withAlpha(COLORS.flare, 0.66))
  g.addColorStop(PERFECT_CENTER, withAlpha(COLORS.flare, 0.95))
  g.addColorStop(TIMING.perfectEnd, withAlpha(COLORS.flare, 0.66))
  g.addColorStop(TIMING.greatEnd, withAlpha(COLORS.cyan, 0.44))
  g.addColorStop(TIMING.goodEnd, withAlpha(COLORS.cyan, 0.16))
  g.addColorStop(TIMING.badEnd, withAlpha(COLORS.cyan, 0))
  g.addColorStop(1, withAlpha(COLORS.cyan, 0))

  return g
}

/** Los tokens son hex; el canvas necesita alpha por separado. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Label chico en mayúscula con el tracking ancho que es firma del estilo. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = `700 11px ${FONTS.ui}`
  ctx.fillStyle = COLORS.inkMuted
  ctx.letterSpacing = '3px'
  ctx.fillText(text, x, y)
  ctx.letterSpacing = '0px'
}

const ARROW_ANGLE: Record<ArrowDirection, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
}

/**
 * Flecha vectorial: cabeza triangular más un vástago rectangular.
 *
 * Se dibuja apuntando a la derecha y se rota. Así las cuatro son idénticas
 * salvo el ángulo — con glifos de fuente cada una traía su propio peso óptico.
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  dir: ArrowDirection,
  cx: number,
  cy: number,
  size: number,
  skin: Skin,
): void {
  const s = size / 2
  const head = s * 0.9
  const stem = s * 0.34

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(ARROW_ANGLE[dir])
  // Uniones y puntas redondeadas: el polígono crudo se veía duro y de otro
  // juego. Con esto la misma silueta pasa a tener aire arcade.
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(head, 0)
  ctx.lineTo(0, -head)
  ctx.lineTo(0, -stem)
  ctx.lineTo(-head, -stem)
  ctx.lineTo(-head, stem)
  ctx.lineTo(0, stem)
  ctx.lineTo(0, head)
  ctx.closePath()

  // Contorno grueso primero; después el relleno lo engorda hasta el borde
  // interno. Es lo que le da el look de sticker.
  ctx.lineWidth = size * 0.3
  ctx.strokeStyle = skin.outline
  ctx.stroke()

  ctx.fillStyle = skin.fg
  ctx.fill()
  ctx.lineWidth = size * 0.14
  ctx.strokeStyle = skin.fg
  ctx.stroke()

  ctx.restore()
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
