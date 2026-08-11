import { describe, expect, it } from 'vitest'

import { PROGRESSION, ROUND, SCORING, TIMING } from './constants'
import {
  createGame,
  judge,
  levelFor,
  multiplierFor,
  pressKey,
  pressSpace,
  progressAt,
  remainingMs,
  startRound,
  tick,
  type GameState,
} from './engine'
import type { Step } from './sequence'

const SEQ: readonly Step[] = [
  { key: 'ArrowUp', glyph: '↑' },
  { key: 'ArrowRight', glyph: '→' },
]

/** Duración de ronda fija para los tests: el motor ya no la calcula. */
const DUR = 3000

/** Progreso cómodamente dentro de la ventana PERFECT. */
const AT_PERFECT = 0.84
/** Progreso dentro de GOOD pero fuera de PERFECT. */
const AT_GOOD = 0.75

function newGame(lives = 3, durationMs: number | null = null): GameState {
  return createGame({ lives, durationMs })
}

function typeAll(state: GameState): GameState {
  return state.sequence.reduce((s, step) => pressKey(s, step.key).state, state)
}

/** Juega una ronda entera y deja el juego listo para la siguiente. */
function playRound(state: GameState, atProgress: number): GameState {
  const started = startRound(state, SEQ, DUR, 0)
  const typed = typeAll(started)
  const judged = pressSpace(typed, atProgress * DUR).state
  return tick(judged, DUR + ROUND.interRoundPauseMs)
}

describe('progresión', () => {
  it('sube de nivel cada 4 aciertos', () => {
    expect(levelFor(0)).toBe(1)
    expect(levelFor(PROGRESSION.hitsPerLevel - 1)).toBe(1)
    expect(levelFor(PROGRESSION.hitsPerLevel)).toBe(2)
    expect(levelFor(PROGRESSION.hitsPerLevel * 2)).toBe(3)
  })
})

describe('ventanas de timing', () => {
  it('acierta PERFECT en los bordes exactos', () => {
    // Si esto falla, alguien reescribió la ventana como centro ± radio
    // y volvió a meter la resta en punto flotante.
    expect(judge(TIMING.perfectStart)).toBe('perfect')
    expect(judge(TIMING.perfectEnd)).toBe('perfect')
  })

  it('degrada a GOOD apenas afuera de PERFECT', () => {
    expect(judge(TIMING.perfectStart - 0.001)).toBe('good')
    expect(judge(TIMING.perfectEnd + 0.001)).toBe('good')
  })

  it('acepta GOOD en los bordes exactos', () => {
    expect(judge(TIMING.goodStart)).toBe('good')
    expect(judge(TIMING.goodEnd)).toBe('good')
  })

  it('es MISS afuera de GOOD', () => {
    expect(judge(TIMING.goodStart - 0.001)).toBe('miss')
    expect(judge(TIMING.goodEnd + 0.001)).toBe('miss')
    expect(judge(0)).toBe('miss')
    expect(judge(1)).toBe('miss')
  })
})

describe('multiplicador', () => {
  it('sube de a 1 cada 5 de combo', () => {
    expect(multiplierFor(0)).toBe(1)
    expect(multiplierFor(SCORING.comboStep - 1)).toBe(1)
    expect(multiplierFor(SCORING.comboStep)).toBe(2)
    expect(multiplierFor(SCORING.comboStep * 2)).toBe(3)
  })
})

describe('la ronda llega como dato', () => {
  it('usa la duración que le pasan, no una fórmula propia', () => {
    // El motor no sabe si el ritmo acelera o es fijo: le dicen cuánto dura.
    expect(startRound(newGame(), SEQ, 1234, 0).roundDurationMs).toBe(1234)
    expect(startRound(newGame(), SEQ, 9999, 0).roundDurationMs).toBe(9999)
  })

  it('acepta secuencias de cualquier largo', () => {
    const larga: Step[] = Array.from({ length: 8 }, () => ({ key: 'A', glyph: 'A' }))
    expect(startRound(newGame(), larga, DUR, 0).sequence).toHaveLength(8)
  })
})

describe('input de secuencia', () => {
  it('avanza con la tecla correcta', () => {
    const state = startRound(newGame(), SEQ, DUR, 0)
    const { state: next, result } = pressKey(state, 'ArrowUp')

    expect(result).toBe('advance')
    expect(next.index).toBe(1)
  })

  it('reinicia la secuencia con la tecla incorrecta y NO saca vida', () => {
    const state = startRound(newGame(), SEQ, DUR, 0)
    const advanced = pressKey(state, 'ArrowUp').state
    const { state: next, result } = pressKey(advanced, 'ArrowDown')

    expect(result).toBe('reset')
    expect(next.index).toBe(0)
    expect(next.lives).toBe(state.lives)
  })

  it('ignora teclas que no participan', () => {
    const state = startRound(newGame(), SEQ, DUR, 0)
    const { state: next, result } = pressKey(state, 'Shift')

    expect(result).toBe('ignored')
    expect(next).toBe(state)
  })

  it('ignora teclas cuando la secuencia ya está completa', () => {
    const complete = typeAll(startRound(newGame(), SEQ, DUR, 0))
    expect(pressKey(complete, 'ArrowUp').result).toBe('ignored')
  })

  it('acepta letras sin importar la capitalización', () => {
    const word: readonly Step[] = [{ key: 'A', glyph: 'A' }]
    const state = startRound(newGame(), word, DUR, 0)

    expect(pressKey(state, 'a').result).toBe('advance')
  })
})

describe('resolución de la ronda', () => {
  it('ESPACIO con la secuencia incompleta es MISS', () => {
    const state = startRound(newGame(), SEQ, DUR, 0)
    const { state: next, judgement } = pressSpace(state, AT_PERFECT * DUR)

    expect(judgement).toBe('miss')
    expect(next.lives).toBe(2)
    expect(next.score).toBe(0)
  })

  it('PERFECT suma 150 con multiplicador 1', () => {
    const next = playRound(newGame(), AT_PERFECT)

    expect(next.lastJudgement).toBe('perfect')
    expect(next.score).toBe(SCORING.perfect)
    expect(next.combo).toBe(1)
    expect(next.hits).toBe(1)
  })

  it('GOOD suma 60', () => {
    const next = playRound(newGame(), AT_GOOD)

    expect(next.lastJudgement).toBe('good')
    expect(next.score).toBe(SCORING.good)
  })

  it('aplica el multiplicador recién en la ronda que sigue al combo', () => {
    let state = newGame()
    for (let i = 0; i < SCORING.comboStep; i++) state = playRound(state, AT_PERFECT)

    expect(state.combo).toBe(SCORING.comboStep)
    expect(state.score).toBe(SCORING.perfect * SCORING.comboStep)

    state = playRound(state, AT_PERFECT)
    expect(state.score).toBe(SCORING.perfect * SCORING.comboStep + SCORING.perfect * 2)
  })

  it('un MISS corta el combo pero conserva maxCombo', () => {
    let state = playRound(newGame(), AT_PERFECT)
    state = playRound(state, AT_PERFECT)
    expect(state.combo).toBe(2)

    state = playRound(state, 0.1)
    expect(state.lastJudgement).toBe('miss')
    expect(state.combo).toBe(0)
    expect(state.maxCombo).toBe(2)
    expect(state.lives).toBe(2)
  })
})

describe('paso del tiempo', () => {
  it('se acaba la ronda y es MISS', () => {
    const state = typeAll(startRound(newGame(), SEQ, DUR, 0))
    const next = tick(state, DUR)

    expect(next.lastJudgement).toBe('miss')
    expect(next.lives).toBe(2)
  })

  it('no hace nada mientras la ronda sigue viva', () => {
    const state = startRound(newGame(), SEQ, DUR, 0)
    expect(tick(state, DUR / 2)).toBe(state)
  })

  it('vuelve a idle recién cumplida la pausa entre rondas', () => {
    const typed = typeAll(startRound(newGame(), SEQ, DUR, 0))
    const resolved = pressSpace(typed, AT_PERFECT * DUR).state

    expect(resolved.status).toBe('resolved')
    expect(tick(resolved, resolved.resolvedAtMs + ROUND.interRoundPauseMs - 1).status).toBe(
      'resolved',
    )
    expect(tick(resolved, resolved.resolvedAtMs + ROUND.interRoundPauseMs).status).toBe('idle')
  })

  it('sin vidas queda en over y deja de aceptar rondas', () => {
    let state = newGame(1)
    state = playRound(state, 0.1)

    expect(state.status).toBe('over')
    expect(state.lives).toBe(0)
    expect(startRound(state, SEQ, DUR, 0)).toBe(state)
  })
})

describe('partida con tiempo (modo canción)', () => {
  const TOTAL = 10_000

  it('no arranca el reloj hasta la primera ronda', () => {
    const state = newGame(3, TOTAL)

    expect(state.sessionStartMs).toBeNull()
    // Entre crear el juego y arrancar puede pasar cualquier cosa: menú,
    // permiso de audio. Ese tiempo no se le descuenta al jugador.
    expect(remainingMs(state, 999_999)).toBe(TOTAL)
  })

  it('descuenta desde el arranque de la primera ronda', () => {
    const state = startRound(newGame(3, TOTAL), SEQ, DUR, 5_000)

    expect(state.sessionStartMs).toBe(5_000)
    expect(remainingMs(state, 5_000)).toBe(TOTAL)
    expect(remainingMs(state, 8_000)).toBe(TOTAL - 3_000)
    expect(remainingMs(state, 99_000)).toBe(0)
  })

  it('conserva el arranque entre rondas', () => {
    let state = startRound(newGame(3, TOTAL), SEQ, DUR, 5_000)
    state = tick(pressSpace(typeAll(state), 5_000 + AT_PERFECT * DUR).state, 5_000 + DUR + 1_000)
    state = startRound(state, SEQ, DUR, 7_000)

    expect(state.sessionStartMs).toBe(5_000)
  })

  it('termina la partida cuando se acaba el tiempo, aunque haya ronda en curso', () => {
    const state = startRound(newGame(3, TOTAL), SEQ, DUR, 0)
    expect(state.status).toBe('round')

    const next = tick(state, TOTAL)
    expect(next.status).toBe('over')
    // No es un miss: la canción terminó, no la ronda.
    expect(next.lives).toBe(3)
  })

  it('en arcade no termina nunca por tiempo', () => {
    const state = startRound(newGame(3, null), SEQ, DUR, 0)

    expect(remainingMs(state, 10_000_000)).toBeNull()
    expect(tick(state, 10_000_000).status).not.toBe('over')
  })
})

describe('reloj', () => {
  it('calcula el progreso absoluto contra el reloj, no acumulando deltas', () => {
    const state = startRound(newGame(), SEQ, DUR, 10_000)

    expect(progressAt(state, 10_000)).toBe(0)
    expect(progressAt(state, 10_000 + DUR / 2)).toBe(0.5)
    // Puede pasarse de 1: recortar es tarea del que dibuja.
    expect(progressAt(state, 10_000 + DUR * 2)).toBe(2)
  })
})
