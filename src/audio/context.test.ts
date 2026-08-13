import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El bug era **puramente de cableado**: todo salía por el mismo nodo, así que
 * el analizador escuchaba también los efectos del juego y el visualizador
 * reaccionaba a cada tecla del jugador.
 *
 * Por eso el test mira el grafo y no el sonido. Un nodo falso que anota a quién
 * se conecta alcanza para fijar la propiedad: **de los efectos no se puede
 * llegar al analizador**.
 */

type FakeNode = {
  kind: string
  outputs: FakeNode[]
  connect(target: FakeNode): FakeNode
}

function makeNode(kind: string): FakeNode {
  return {
    kind,
    outputs: [],
    connect(target) {
      this.outputs.push(target)
      return target
    },
  }
}

/** ¿Se puede llegar de `from` a un nodo de este tipo siguiendo conexiones? */
function reaches(from: FakeNode, kind: string, seen = new Set<FakeNode>()): boolean {
  if (seen.has(from)) return false
  seen.add(from)
  return from.outputs.some((out) => out.kind === kind || reaches(out, kind, seen))
}

let destination: FakeNode

function installFakeAudio() {
  destination = makeNode('destination')

  class FakeAudioContext {
    currentTime = 0
    state = 'running'
    destination = destination
    createGain = () => ({ ...makeNode('gain'), gain: param() })
    createAnalyser = () => ({
      ...makeNode('analyser'),
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 512,
      getByteFrequencyData: () => {},
    })
    createOscillator = () => ({
      ...makeNode('oscillator'),
      type: '',
      frequency: param(),
      start: () => {},
      stop: () => {},
    })
  }

  const param = () => ({
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  })

  vi.stubGlobal('AudioContext', FakeAudioContext)
}

describe('grafo de audio', () => {
  beforeEach(() => {
    vi.resetModules()
    installFakeAudio()
  })

  it('la música pasa por el analizador', async () => {
    const { musicOut } = await import('./context')
    expect(reaches(musicOut() as unknown as FakeNode, 'analyser')).toBe(true)
  })

  it('los efectos NO pasan por el analizador', async () => {
    // Si esto se rompe, el visualizador vuelve a reaccionar a cada tecla que
    // toca el jugador y a cada veredicto de ronda.
    const { sfxOut } = await import('./context')
    expect(reaches(sfxOut() as unknown as FakeNode, 'analyser')).toBe(false)
  })

  it('las dos ramas terminan igual en la salida', async () => {
    // Separar el análisis no puede dejar una rama muda.
    const { musicOut, sfxOut } = await import('./context')
    expect(reaches(musicOut() as unknown as FakeNode, 'destination')).toBe(true)
    expect(reaches(sfxOut() as unknown as FakeNode, 'destination')).toBe(true)
  })

  it('un tono sin destino explícito sale por efectos', async () => {
    // Es el default que importa: quien llama sin pensarlo no puede terminar
    // metiendo un sonido del juego adentro del análisis.
    const { playTone, sfxOut } = await import('./context')
    playTone({ freq: 440, durationSec: 0.1, gain: 0.1, wave: 'square' })

    const sfx = sfxOut() as unknown as FakeNode
    expect(reaches(sfx, 'analyser')).toBe(false)
    // Y el oscilador quedó colgando de esa rama, no del aire.
    expect(destination.outputs.length).toBe(0)
  })
})
