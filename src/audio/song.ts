import { invoke } from '@tauri-apps/api/core'

import { getAudioContext } from './context'

/**
 * Reproducción de una canción de la biblioteca.
 *
 * Se usa `AudioBufferSourceNode` y no un `<audio>`: `start(when)` agenda contra
 * el mismo reloj del que sale `nowMs()`, así que el audio y el juego comparten
 * base de tiempo. Un elemento `<audio>` tiene su propio reloj y deriva.
 */
export type SongPlayback = {
  /** Cuándo arranca el audio, en la misma escala que `nowMs()`. */
  startedAtMs: number
  stop(): void
}

/** Colchón antes de arrancar: da tiempo a agendar sin llegar tarde. */
const LEAD_SEC = 0.25

/**
 * Trae el audio por IPC y lo decodifica.
 *
 * `decodeAudioData` **consume** el ArrayBuffer, así que este buffer no se puede
 * reusar; lo que se cachea es el `AudioBuffer` que sale.
 */
export async function loadSong(id: string): Promise<AudioBuffer> {
  const bytes = await invoke<ArrayBuffer>('song_audio', { id })
  return await getAudioContext().decodeAudioData(bytes)
}

export function playSong(buffer: AudioBuffer): SongPlayback {
  const ctx = getAudioContext()
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)

  const startAt = ctx.currentTime + LEAD_SEC
  source.start(startAt)

  let stopped = false
  return {
    startedAtMs: startAt * 1000,
    stop() {
      if (stopped) return
      stopped = true
      // Parar un source que ya terminó tira; no es un error que importe.
      try {
        source.stop()
      } catch {
        /* ya había terminado */
      }
      source.disconnect()
    },
  }
}
