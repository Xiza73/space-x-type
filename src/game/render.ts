import { COLORS, FONTS } from '../theme/tokens'
import { TIMING } from './constants'
import {
  meanOffsetMs,
  multiplierFor,
  PERFECT_CENTER,
  progressAt,
  remainingMs,
  totalMisses,
  totalRounds,
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

  // Terminada la partida, el gameplay no se dibuja. Antes se tapaba con un
  // overlay traslúcido y las casillas y el riel se colaban por debajo.
  if (state.status === 'over') {
    drawGameOver(ctx, state, w, h)
    return
  }

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
  const cells: { label: string; value: string; color: string }[] = [
    { label: 'SCORE', value: String(state.score), color: COLORS.ink },
    { label: 'COMBO', value: String(state.combo), color: COLORS.magenta },
    { label: 'MULT', value: `x${multiplierFor(state.combo)}`, color: COLORS.cyan },
  ]

  const spacing = 150
  const totalW = spacing * (cells.length + 1)
  let x = w / 2 - totalW / 2 + spacing / 2

  ctx.textAlign = 'center'
  for (const cell of cells) {
    label(ctx, cell.label, x, 40)
    ctx.font = `700 30px ${FONTS.display}`
    ctx.fillStyle = cell.color
    ctx.fillText(cell.value, x, 74)
    x += spacing
  }

  // En arcade la referencia es el nivel; en canción, cuánto queda de partida.
  const remaining = remainingMs(state, nowMs)
  label(
    ctx,
    remaining === null ? `NIVEL ${state.level}` : `TIEMPO ${formatClock(remaining)}`,
    x,
    40,
  )
  drawHearts(ctx, state, x, 74)
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
  const total = state.config.lives
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
    const done = i < state.index
    const current = i === state.index

    roundedRect(ctx, tile.x, tile.y, tile.width, tile.height, 13)
    ctx.fillStyle = done ? COLORS.magentaDark : COLORS.tile
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = done ? COLORS.magenta : current ? COLORS.cyan : COLORS.line
    ctx.stroke()

    const step = state.sequence[i]
    const cx = tile.x + tile.width / 2
    const cy = tile.y + tile.height / 2
    const fg = done || current ? COLORS.ink : COLORS.inkMuted

    if (step.dir === undefined) {
      ctx.font = `32px ${FONTS.display}`
      ctx.fillStyle = fg
      ctx.fillText(step.glyph, cx, cy + 2)
    } else {
      drawArrow(ctx, step.dir, cx, cy, 32, fg)
    }
  })

  ctx.textBaseline = 'alphabetic'
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
  ctx.fillStyle = zoneGradient(ctx, rail)
  ctx.fillRect(rail.x, rail.y, rail.width, rail.height)

  // Los bordes de PERFECT sí van marcados: el degradado se ve lindo pero no te
  // dice dónde empieza exactamente la zona que más suma.
  edge(ctx, rail, TIMING.perfectStart)
  edge(ctx, rail, TIMING.perfectEnd)

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
  const mid = (a: number, b: number) => (a + b) / 2

  // Los stops tienen que ir en orden creciente o el navegador tira error.
  g.addColorStop(0, withAlpha(COLORS.purple, 0))
  g.addColorStop(TIMING.badStart, withAlpha(COLORS.purple, 0))
  g.addColorStop(mid(TIMING.badStart, TIMING.goodStart), withAlpha(COLORS.purple, 0.16))
  g.addColorStop(TIMING.goodStart, withAlpha(COLORS.cyan, 0.2))
  g.addColorStop(TIMING.greatStart, withAlpha(COLORS.magenta, 0.28))
  g.addColorStop(TIMING.perfectStart, withAlpha(COLORS.gold, 0.34))
  g.addColorStop(PERFECT_CENTER, withAlpha(COLORS.gold, 0.52))
  g.addColorStop(TIMING.perfectEnd, withAlpha(COLORS.gold, 0.34))
  g.addColorStop(TIMING.greatEnd, withAlpha(COLORS.magenta, 0.28))
  g.addColorStop(TIMING.goodEnd, withAlpha(COLORS.cyan, 0.2))
  g.addColorStop(mid(TIMING.goodEnd, TIMING.badEnd), withAlpha(COLORS.purple, 0.16))
  g.addColorStop(TIMING.badEnd, withAlpha(COLORS.purple, 0))
  g.addColorStop(1, withAlpha(COLORS.purple, 0))

  return g
}

/** Marca vertical dorada en un punto del riel. */
function edge(ctx: CanvasRenderingContext2D, rail: Rect, at: number): void {
  const x = rail.x + at * rail.width
  ctx.strokeStyle = withAlpha(COLORS.gold, 0.85)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, rail.y)
  ctx.lineTo(x, rail.y + rail.height)
  ctx.stroke()
}

/** Los tokens son hex; el canvas necesita alpha por separado. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function drawGameOver(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
): void {
  ctx.textAlign = 'center'
  ctx.font = `700 48px ${FONTS.display}`
  ctx.fillStyle = COLORS.ink
  ctx.fillText('GAME OVER', w / 2, h * 0.22)

  scoreCell(ctx, 'PUNTAJE', String(state.score), COLORS.cyan, w / 2 - 110, h * 0.32)
  scoreCell(ctx, 'MAX COMBO', String(state.maxCombo), COLORS.magenta, w / 2 + 110, h * 0.32)

  drawStats(ctx, state, w, h)

  ctx.textAlign = 'center'
  ctx.font = `600 16px ${FONTS.ui}`
  ctx.fillStyle = COLORS.inkSoft
  ctx.fillText('ENTER para reintentar', w / 2, h * 0.88)
}

function scoreCell(
  ctx: CanvasRenderingContext2D,
  name: string,
  value: string,
  color: string,
  x: number,
  y: number,
): void {
  label(ctx, name, x, y)
  ctx.textAlign = 'center'
  ctx.font = `700 36px ${FONTS.display}`
  ctx.fillStyle = color
  ctx.fillText(value, x, y + 42)
}

/**
 * Desglose para calibrar. Sin esto, "se siente raro" no se puede convertir en
 * qué constante mover: los tres tipos de miss se sienten igual jugando y se
 * arreglan con números distintos.
 */
function drawStats(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
): void {
  const s = state.stats
  const rounds = totalRounds(s)
  if (rounds === 0) return

  const pct = (n: number) => `${Math.round((n / rounds) * 100)}%`
  const y = h * 0.52

  const cells = [
    { name: 'PERFECT', n: s.perfect, color: COLORS.gold },
    { name: 'GREAT', n: s.great, color: COLORS.magenta },
    { name: 'GOOD', n: s.good, color: COLORS.cyan },
    { name: 'BAD', n: s.bad, color: COLORS.purple },
    { name: 'MISS', n: totalMisses(s), color: COLORS.red },
  ].map((c) => ({ ...c, value: String(c.n), sub: pct(c.n) }))

  ctx.textAlign = 'center'
  const spacing = Math.min(140, (w - 80) / cells.length)
  let x = w / 2 - (spacing * (cells.length - 1)) / 2

  for (const cell of cells) {
    label(ctx, cell.name, x, y)
    ctx.textAlign = 'center'
    ctx.font = `700 30px ${FONTS.display}`
    ctx.fillStyle = cell.color
    ctx.fillText(cell.value, x, y + 36)
    ctx.font = `600 13px ${FONTS.ui}`
    ctx.fillStyle = COLORS.inkMuted
    ctx.fillText(cell.sub, x, y + 56)
    x += spacing
  }

  // Las dos líneas que realmente dicen qué constante mover.
  ctx.textAlign = 'center'
  ctx.font = `600 14px ${FONTS.ui}`
  ctx.fillStyle = COLORS.inkSoft
  ctx.fillText(
    `sin terminar a tiempo ${s.missTimeout}  ·  espacio anticipado ${s.missIncomplete}  ·  fuera de zona ${s.missWindow}`,
    w / 2,
    h * 0.72,
  )

  const offset = meanOffsetMs(s)
  if (offset === null) return

  const ms = Math.round(offset)
  const veredicto =
    Math.abs(ms) < 25 ? 'centrado' : ms < 0 ? 'apretás ANTES de tiempo' : 'apretás DESPUÉS'

  ctx.font = `700 15px ${FONTS.ui}`
  ctx.fillStyle = Math.abs(ms) < 25 ? COLORS.gold : COLORS.inkSoft
  ctx.fillText(`desvío medio ${ms > 0 ? '+' : ''}${ms}ms — ${veredicto}`, w / 2, h * 0.78)
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
  color: string,
): void {
  const s = size / 2
  const stem = s * 0.42

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(ARROW_ANGLE[dir])
  ctx.fillStyle = color

  ctx.beginPath()
  ctx.moveTo(s, 0)
  ctx.lineTo(0, -s)
  ctx.lineTo(0, -stem)
  ctx.lineTo(-s, -stem)
  ctx.lineTo(-s, stem)
  ctx.lineTo(0, stem)
  ctx.lineTo(0, s)
  ctx.closePath()
  ctx.fill()

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
