import { invoke } from '@tauri-apps/api/core'

import type { RhythmMode, SpeedId } from '../components/GameCanvas'
import type { Language, SequenceType } from '../game/sequence'

/** Igual que `MAX_NAME_LEN` en `src-tauri/src/scores.rs`. */
export const MAX_NAME_LEN = 10

export type ScoreEntry = {
  name: string
  score: number
  maxCombo: number
  mode: string
  at: number
}

export type NewScore = Omit<ScoreEntry, 'at'>

/**
 * Clave de la tabla. Cada configuración tiene la suya porque **los puntajes de
 * modos distintos no se comparan**: arcade es infinito y canción dura dos
 * minutos, así que un top 5 mezclado lo ganaría siempre arcade.
 *
 * El idioma entra en la clave: tipear en español y en inglés no cuesta igual.
 */
export function modeKey(
  sequenceType: SequenceType,
  language: Language,
  rhythmMode: RhythmMode,
  speed: SpeedId,
): string {
  const seq = sequenceType === 'arrows' ? 'arrows' : `words-${language}`
  return rhythmMode === 'arcade' ? `${seq}/arcade` : `${seq}/song-${speed}`
}

export function loadScores(mode: string): Promise<ScoreEntry[]> {
  return invoke<ScoreEntry[]>('load_scores', { mode })
}

export function saveScore(entry: NewScore): Promise<ScoreEntry[]> {
  return invoke<ScoreEntry[]>('save_score', { entry })
}
