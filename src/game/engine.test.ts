import { describe, expect, it } from 'vitest'

import { PROGRESSION, ROUND, SCORING, TIMING } from './constants'
import {
  createGame,
  judge,
  levelFor,
  meanOffsetMs,
  multiplierFor,
  PERFECT_CENTER,
  pressKey,
  pressSpace,
  progressAt,
  remainingMs,
  startRound,
  tick,
  totalRounds,
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

function newGame(lives: number | null = 3, durationMs: number | null = null): GameState {
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

  it('baja un escalón por vez al alejarse del centro', () => {
    expect(judge(TIMING.perfectStart - 0.001)).toBe('great')
    expect(judge(TIMING.greatStart - 0.001)).toBe('good')
    expect(judge(TIMING.goodStart - 0.001)).toBe('bad')
    expect(judge(TIMING.badStart - 0.001)).toBe('miss')
  })

  it('baja un escalón por vez también del otro lado', () => {
    expect(judge(TIMING.perfectEnd + 0.001)).toBe('great')
    expect(judge(TIMING.greatEnd + 0.001)).toBe('good')
    expect(judge(TIMING.goodEnd + 0.001)).toBe('bad')
    expect(judge(TIMING.badEnd + 0.001)).toBe('miss')
  })

  it('acepta cada escalón en sus bordes exactos', () => {
    expect(judge(TIMING.greatStart)).toBe('great')
    expect(judge(TIMING.greatEnd)).toBe('great')
    expect(judge(TIMING.goodStart)).toBe('good')
    expect(judge(TIMING.goodEnd)).toBe('good')
    expect(judge(TIMING.badStart)).toBe('bad')
    expect(judge(TIMING.badEnd)).toBe('bad')
  })

  it('es MISS afuera de todo', () => {
    expect(judge(0)).toBe('miss')
    expect(judge(1)).toBe('miss')
  })

  it('mantiene las ventanas anidadas', () => {
    // Si alguien mueve una y rompe el anidado, `judge` empieza a saltear
    // escalones y el degradado del riel deja de tener sentido.
    expect(TIMING.badStart).toBeLessThan(TIMING.goodStart)
    expect(TIMING.goodStart).toBeLessThan(TIMING.greatStart)
    expect(TIMING.greatStart).toBeLessThan(TIMING.perfectStart)
    expect(TIMING.perfectEnd).toBeLessThan(TIMING.greatEnd)
    expect(TIMING.greatEnd).toBeLessThan(TIMING.goodEnd)
    expect(TIMING.goodEnd).toBeLessThan(TIMING.badEnd)
  })
})

describe('qué hace cada escalón', () => {
  const at = (progress: number, state = newGame()) =>
    pressSpace(typeAll(startRound(state, SEQ, DUR, 0)), progress * DUR).state

  it('GREAT suma y mantiene el combo', () => {
    const s = at(TIMING.greatStart)
    expect(s.lastJudgement).toBe('great')
    expect(s.score).toBe(SCORING.great)
    expect(s.combo).toBe(1)
    expect(s.lives).toBe(3)
  })

  it('BAD suma poco, NO saca vida, pero corta el combo', () => {
    // Ese es todo el sentido de BAD: es el aviso antes de empezar a perder.
    let s = at(TIMING.perfectStart, newGame())
    s = at(TIMING.badStart, { ...s, status: 'idle' })

    expect(s.lastJudgement).toBe('bad')
    expect(s.score).toBe(SCORING.perfect + SCORING.bad)
    expect(s.combo).toBe(0)
    expect(s.lives).toBe(3)
  })

  it('BAD no cuenta para la progresión', () => {
    const s = at(TIMING.badStart)
    expect(s.hits).toBe(0)
    expect(s.stats.bad).toBe(1)
  })

  it('MISS es el único que saca vida', () => {
    const s = at(0.1)
    expect(s.lastJudgement).toBe('miss')
    expect(s.lives).toBe(2)
    expect(s.hits).toBe(0)
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

  it('sin vidas, fallar no corta la partida', () => {
    // La canción dura lo que dura. Cortarla a la mitad por fallar es sacar al
    // jugador de la canción, que es lo contrario de lo que hace el género.
    let state = newGame(null, TOTAL)
    for (let i = 0; i < 20; i++) {
      state = startRound({ ...state, status: 'idle' }, SEQ, DUR, 0)
      state = pressSpace(state, 0.1 * DUR).state
    }

    expect(state.stats.missIncomplete).toBe(20)
    expect(state.status).not.toBe('over')
  })

  it('sin vidas, el HUD no tiene nada que dibujar', () => {
    expect(newGame(null, TOTAL).config.lives).toBeNull()
  })

  it('en arcade no termina nunca por tiempo', () => {
    const state = startRound(newGame(3, null), SEQ, DUR, 0)

    expect(remainingMs(state, 10_000_000)).toBeNull()
    expect(tick(state, 10_000_000).status).not.toBe('over')
  })
})

describe('medición para calibrar', () => {
  it('separa los tres tipos de miss, porque se arreglan distinto', () => {
    // 1) Espacio con la secuencia sin terminar.
    const incompleta = pressSpace(startRound(newGame(), SEQ, DUR, 0), 0.84 * DUR).state
    expect(incompleta.stats.missIncomplete).toBe(1)

    // 2) Secuencia completa, pero fuera de la ventana.
    const fuera = pressSpace(typeAll(startRound(newGame(), SEQ, DUR, 0)), 0.2 * DUR).state
    expect(fuera.stats.missWindow).toBe(1)

    // 3) Se acabó la barra.
    const vencida = tick(typeAll(startRound(newGame(), SEQ, DUR, 0)), DUR)
    expect(vencida.stats.missTimeout).toBe(1)
  })

  it('cuenta aciertos por tipo', () => {
    let state = playRound(newGame(), AT_PERFECT)
    state = playRound(state, AT_GOOD)

    expect(state.stats.perfect).toBe(1)
    expect(state.stats.good).toBe(1)
    expect(totalRounds(state.stats)).toBe(2)
  })

  it('mide el desvío en ms contra el centro de PERFECT', () => {
    // Apretar 0.1 del riel antes del centro con una ronda de 3000ms
    // son 300ms de anticipación.
    const early = pressSpace(
      typeAll(startRound(newGame(), SEQ, DUR, 0)),
      (PERFECT_CENTER - 0.1) * DUR,
    ).state

    expect(meanOffsetMs(early.stats)).toBeCloseTo(-0.1 * DUR)
  })

  it('promedia varios desvíos', () => {
    let state = playRound(newGame(), PERFECT_CENTER - 0.02)
    state = playRound(state, PERFECT_CENTER + 0.02)

    // Uno antes y uno después de la misma magnitud: promedio centrado.
    expect(meanOffsetMs(state.stats)).toBeCloseTo(0)
  })

  it('NO mide desvío cuando la secuencia quedó incompleta', () => {
    // Ese momento no habla de precisión, habla de velocidad de dedos.
    // Mezclarlos ensuciaría la única señal que sirve para mover la ventana.
    const state = pressSpace(startRound(newGame(), SEQ, DUR, 0), 0.5 * DUR).state

    expect(state.stats.offsetCount).toBe(0)
    expect(meanOffsetMs(state.stats)).toBeNull()
  })

  it('tampoco mide desvío cuando se acabó la barra', () => {
    const state = tick(typeAll(startRound(newGame(), SEQ, DUR, 0)), DUR)

    expect(meanOffsetMs(state.stats)).toBeNull()
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
