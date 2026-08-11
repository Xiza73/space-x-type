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
  roundDurationMs,
  startRound,
  tick,
  type GameState,
} from './engine'
import type { Step } from './sequence'

const SEQ: readonly Step[] = [
  { key: 'ArrowUp', glyph: '↑' },
  { key: 'ArrowRight', glyph: '→' },
]

/** Progreso cómodamente dentro de la ventana PERFECT. */
const AT_PERFECT = 0.84
/** Progreso dentro de GOOD pero fuera de PERFECT. */
const AT_GOOD = 0.75

function newGame(lives = 3, speedScale = 1): GameState {
  return createGame({ lives, speedScale })
}

function typeAll(state: GameState): GameState {
  return state.sequence.reduce((s, step) => pressKey(s, step.key).state, state)
}

/** Juega una ronda entera y deja el juego listo para la siguiente. */
function playRound(state: GameState, atProgress: number): GameState {
  const started = startRound(state, SEQ, 0)
  const typed = typeAll(started)
  const judged = pressSpace(typed, atProgress * typed.roundDurationMs).state
  return tick(judged, typed.roundDurationMs + ROUND.interRoundPauseMs)
}

describe('progresión', () => {
  it('sube de nivel cada 4 aciertos', () => {
    expect(levelFor(0)).toBe(1)
    expect(levelFor(3)).toBe(1)
    expect(levelFor(4)).toBe(2)
    expect(levelFor(8)).toBe(3)
  })

  it('acorta la ronda 350ms por nivel', () => {
    expect(roundDurationMs(1, 1)).toBe(PROGRESSION.baseDurationMs)
    expect(roundDurationMs(2, 1)).toBe(PROGRESSION.baseDurationMs - PROGRESSION.durationStepMs)
  })

  it('nunca baja del piso de 1500ms', () => {
    expect(roundDurationMs(99, 1)).toBe(PROGRESSION.minDurationMs)
    // speedScale bajo también choca contra el piso, no lo atraviesa.
    expect(roundDurationMs(1, 0.1)).toBe(PROGRESSION.minDurationMs)
  })

  it('escala con speedScale', () => {
    expect(roundDurationMs(1, 1.5)).toBe(PROGRESSION.baseDurationMs * 1.5)
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

describe('input de secuencia', () => {
  it('avanza con la tecla correcta', () => {
    const state = startRound(newGame(), SEQ, 0)
    const { state: next, result } = pressKey(state, 'ArrowUp')

    expect(result).toBe('advance')
    expect(next.index).toBe(1)
  })

  it('reinicia la secuencia con la tecla incorrecta y NO saca vida', () => {
    const state = startRound(newGame(), SEQ, 0)
    const advanced = pressKey(state, 'ArrowUp').state
    const { state: next, result } = pressKey(advanced, 'ArrowDown')

    expect(result).toBe('reset')
    expect(next.index).toBe(0)
    expect(next.lives).toBe(state.lives)
  })

  it('ignora teclas que no participan', () => {
    const state = startRound(newGame(), SEQ, 0)
    const { state: next, result } = pressKey(state, 'Shift')

    expect(result).toBe('ignored')
    expect(next).toBe(state)
  })

  it('ignora teclas cuando la secuencia ya está completa', () => {
    const complete = typeAll(startRound(newGame(), SEQ, 0))
    const { result } = pressKey(complete, 'ArrowUp')

    expect(result).toBe('ignored')
  })

  it('acepta letras sin importar la capitalización', () => {
    const word: readonly Step[] = [{ key: 'A', glyph: 'A' }]
    const state = startRound(newGame(), word, 0)

    expect(pressKey(state, 'a').result).toBe('advance')
  })
})

describe('resolución de la ronda', () => {
  it('ESPACIO con la secuencia incompleta es MISS', () => {
    const state = startRound(newGame(), SEQ, 0)
    const { state: next, judgement } = pressSpace(state, AT_PERFECT * state.roundDurationMs)

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
    // 5 rondas a multiplicador 1, la sexta ya a multiplicador 2.
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
    const state = typeAll(startRound(newGame(), SEQ, 0))
    const next = tick(state, state.roundDurationMs)

    expect(next.lastJudgement).toBe('miss')
    expect(next.lives).toBe(2)
  })

  it('no hace nada mientras la ronda sigue viva', () => {
    const state = startRound(newGame(), SEQ, 0)

    expect(tick(state, state.roundDurationMs / 2)).toBe(state)
  })

  it('vuelve a idle recién cumplida la pausa entre rondas', () => {
    const state = startRound(newGame(), SEQ, 0)
    const typed = typeAll(state)
    const resolved = pressSpace(typed, AT_PERFECT * typed.roundDurationMs).state

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
    expect(startRound(state, SEQ, 0)).toBe(state)
  })
})

describe('reloj', () => {
  it('calcula el progreso absoluto contra el reloj, no acumulando deltas', () => {
    const state = startRound(newGame(), SEQ, 10_000)

    expect(progressAt(state, 10_000)).toBe(0)
    expect(progressAt(state, 10_000 + state.roundDurationMs / 2)).toBe(0.5)
    // Puede pasarse de 1: recortar es tarea del que dibuja.
    expect(progressAt(state, 10_000 + state.roundDurationMs * 2)).toBe(2)
  })
})
