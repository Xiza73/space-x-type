import { invoke } from '@tauri-apps/api/core'

export type Song = {
  id: string
  title: string
  durationSec: number
  url: string
  audioFile: string
  addedAt: number
  /** Tempo detectado al analizar. No se pisa nunca. */
  bpm: number | null
  /** Corrección manual. `null` = vale el detectado. */
  bpmOverride: number | null
}

export type SongStatus = Song & {
  /** `false` si el índice la tiene pero el audio ya no está en el disco. */
  intact: boolean
  /** Rango sugerido para corregir el tempo. Lo calcula el core. */
  bpmRange: [number, number] | null
}

/** Tempo con el que se juega: la corrección si existe, si no el detectado. */
export function effectiveBpm(song: Song): number | null {
  return song.bpmOverride ?? song.bpm
}

/** Guarda una corrección de tempo. `null` vuelve al detectado. */
export function setSongBpm(id: string, bpm: number | null): Promise<Song> {
  return invoke<Song>('set_song_bpm', { id, bpm })
}

export type Processed = {
  song: Song
  /** `true` si ya estaba en la biblioteca y no se descargó nada. */
  reused: boolean
}

export function listSongs(): Promise<SongStatus[]> {
  return invoke<SongStatus[]>('list_songs')
}

/**
 * Descarga y registra una canción. Es una operación de **una sola vez**: si la
 * URL ya está y el audio sigue en el disco, vuelve con `reused: true` sin bajar
 * nada.
 */
export function processSong(url: string): Promise<Processed> {
  return invoke<Processed>('process_song', { url })
}

export function deleteSong(id: string): Promise<void> {
  return invoke<void>('delete_song', { id })
}

export type Beatmap = {
  version: number
  bpm: number
  /** Dónde cae el primer beat, en ms desde el arranque del audio. */
  firstBeatMs: number
  durationMs: number
  beatsPerRound: number
  /** Derivado del BPM y los beats por ronda. */
  roundDurationMs: number
}

export function songBeatmap(id: string): Promise<Beatmap> {
  return invoke<Beatmap>('song_beatmap', { id })
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—'
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
