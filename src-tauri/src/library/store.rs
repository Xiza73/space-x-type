//! Índice de la biblioteca y rutas en disco.
//!
//! `library.json` es un **índice**, no la fuente de verdad del contenido: si
//! una entrada apunta a una carpeta que ya no existe, se marca rota y se ofrece
//! reprocesar. No se asume que el disco quedó intacto.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::jsonstore::StoreError;

/// Migrar después sale mucho más caro que preverlo ahora.
pub const SCHEMA_VERSION: u32 = 1;

const INDEX_FILE: &str = "library.json";
const SONGS_DIR: &str = "songs";
const AUDIO_STEM: &str = "audio";

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error(transparent)]
    Source(#[from] super::source::SourceError),
    #[error("la ruta calculada quedó fuera del directorio de la app")]
    OutsideDataDir,
    #[error("no se pudo descargar el audio")]
    Download,
    #[error("la canción dura {seconds} s: el mínimo es {min} s")]
    TooShort { seconds: u32, min: u32 },
    #[error("la canción dura {seconds} s: el máximo es {max} s")]
    TooLong { seconds: u32, max: u32 },
    #[error("no se pudo saber cuánto dura: ¿es una transmisión en vivo?")]
    UnknownDuration,
    #[error("no se pudo analizar el audio")]
    Analysis,
    #[error("esa canción no está en la biblioteca")]
    NotFound,
    #[error("yt-dlp no está en el PATH")]
    YtDlpMissing,
    #[error("error de disco: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    /// Id de video de YouTube ya validado. Es la clave de deduplicación **y**
    /// el nombre de la carpeta.
    pub id: String,
    pub title: String,
    pub duration_sec: u32,
    pub url: String,
    /// Solo el nombre del archivo, nunca una ruta: la ruta se recalcula
    /// siempre desde el id validado.
    pub audio_file: String,
    pub added_at: u64,
    /// Tempo **detectado**. Se llena al analizar el audio y no se pisa nunca:
    /// aunque el usuario corrija el tempo, esta sigue siendo la medición.
    pub bpm: Option<f32>,
    /// Corrección manual del tempo. `None` = vale el detectado.
    ///
    /// `serde(default)` no es opcional aquí: sin eso, un `library.json` escrito
    /// por una versión anterior no parsearía y terminaría respaldado como
    /// corrupto, o sea que el usuario perdería su biblioteca al actualizar.
    #[serde(default)]
    pub bpm_override: Option<f32>,
}


#[derive(Debug, Serialize, Deserialize)]
pub struct Library {
    pub version: u32,
    pub songs: Vec<Song>,
}

impl Default for Library {
    fn default() -> Self {
        Self { version: SCHEMA_VERSION, songs: Vec::new() }
    }
}

pub fn index_path(data_dir: &Path) -> PathBuf {
    data_dir.join(INDEX_FILE)
}

/// Carpeta de una canción. `id` **tiene que venir de `source::video_id`**:
/// esa función garantiza 11 caracteres de `[A-Za-z0-9_-]`, que es lo que hace
/// imposible que este join se escape del directorio base.
pub fn song_dir(data_dir: &Path, id: &str) -> PathBuf {
    data_dir.join(SONGS_DIR).join(id)
}

pub fn audio_stem() -> &'static str {
    AUDIO_STEM
}

pub fn beatmap_path(data_dir: &Path, id: &str) -> PathBuf {
    song_dir(data_dir, id).join(super::analysis::BEATMAP_FILE)
}

/// Segunda barrera contra path traversal, sobre la ruta ya canonicalizada.
///
/// El id validado ya lo hace imposible; esto cubre el día que alguien agregue
/// otra forma de construir la ruta y se olvide de validar.
pub fn ensure_inside(base: &Path, candidate: &Path) -> Result<(), LibraryError> {
    let base = base.canonicalize()?;
    let candidate = candidate.canonicalize()?;
    if candidate.starts_with(&base) {
        Ok(())
    } else {
        Err(LibraryError::OutsideDataDir)
    }
}

/// Agrega o reemplaza una canción, manteniendo el orden por fecha descendente.
pub fn upsert(songs: &[Song], song: Song) -> Vec<Song> {
    let mut out: Vec<Song> = songs.iter().filter(|s| s.id != song.id).cloned().collect();
    out.push(song);
    out.sort_by(|a, b| b.added_at.cmp(&a.added_at));
    out
}

pub fn remove(songs: &[Song], id: &str) -> Vec<Song> {
    songs.iter().filter(|s| s.id != id).cloned().collect()
}

pub fn find<'a>(songs: &'a [Song], id: &str) -> Option<&'a Song> {
    songs.iter().find(|s| s.id == id)
}

/// ¿El audio de esta entrada sigue existiendo en el disco?
///
/// El índice puede quedar desincronizado del contenido —el usuario borra una
/// carpeta, se llena el disco a mitad de descarga—, y eso es un estado esperado,
/// no imposible.
pub fn is_intact(data_dir: &Path, song: &Song) -> bool {
    song_dir(data_dir, &song.id).join(&song.audio_file).is_file()
}

/// Borra la carpeta de una canción.
///
/// La ruta se deriva del **id validado**, nunca de algo que mande el frontend:
/// un borrado recursivo con la ruta equivocada no tiene deshacer.
pub fn delete_files(data_dir: &Path, id: &str) -> Result<(), LibraryError> {
    let dir = song_dir(data_dir, id);
    if dir.exists() {
        ensure_inside(data_dir, &dir)?;
        fs::remove_dir_all(dir)?;
    }
    Ok(())
}

pub fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn song(id: &str, added_at: u64) -> Song {
        Song {
            id: id.to_string(),
            title: "Titulo".into(),
            duration_sec: 200,
            url: format!("https://youtu.be/{id}"),
            audio_file: "audio.m4a".into(),
            added_at,
            bpm: None,
            bpm_override: None,
        }
    }

    #[test]
    fn un_indice_sin_el_campo_nuevo_sigue_leyendose() {
        // Migración: un library.json escrito antes de que existiera la
        // corrección de tempo tiene que seguir parseando, o el usuario pierde
        // su biblioteca al actualizar.
        let viejo = r#"{"id":"dQw4w9WgXcQ","title":"T","durationSec":10,
            "url":"https://youtu.be/dQw4w9WgXcQ","audioFile":"audio.m4a",
            "addedAt":1,"bpm":128.0}"#;

        let song: Song = serde_json::from_str(viejo).unwrap();
        assert_eq!(song.bpm, Some(128.0));
        assert_eq!(song.bpm_override, None);
    }

    fn tmp_dir(nombre: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sxt-library-{nombre}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn la_carpeta_cuelga_del_directorio_de_datos() {
        let dir = Path::new("/datos");
        assert_eq!(song_dir(dir, "dQw4w9WgXcQ"), dir.join("songs").join("dQw4w9WgXcQ"));
    }

    #[test]
    fn upsert_reemplaza_en_vez_de_duplicar() {
        let songs = vec![song("aaaaaaaaaaa", 1)];
        let out = upsert(&songs, song("aaaaaaaaaaa", 5));

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].added_at, 5);
    }

    #[test]
    fn upsert_ordena_por_fecha_descendente() {
        let mut songs = Vec::new();
        for (i, id) in ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"].iter().enumerate() {
            songs = upsert(&songs, song(id, i as u64));
        }
        assert_eq!(
            songs.iter().map(|s| s.added_at).collect::<Vec<_>>(),
            vec![2, 1, 0]
        );
    }

    #[test]
    fn remove_saca_solo_la_pedida() {
        let songs = vec![song("aaaaaaaaaaa", 1), song("bbbbbbbbbbb", 2)];
        let out = remove(&songs, "aaaaaaaaaaa");

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "bbbbbbbbbbb");
    }

    #[test]
    fn detecta_una_entrada_rota() {
        let dir = tmp_dir("intacta");
        let s = song("dQw4w9WgXcQ", 1);

        // El índice la tiene, el disco no.
        assert!(!is_intact(&dir, &s));

        let carpeta = song_dir(&dir, &s.id);
        fs::create_dir_all(&carpeta).unwrap();
        fs::write(carpeta.join(&s.audio_file), b"audio").unwrap();
        assert!(is_intact(&dir, &s));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ensure_inside_acepta_lo_que_cuelga_de_la_base() {
        let dir = tmp_dir("dentro");
        let carpeta = song_dir(&dir, "dQw4w9WgXcQ");
        fs::create_dir_all(&carpeta).unwrap();

        assert!(ensure_inside(&dir, &carpeta).is_ok());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ensure_inside_rechaza_lo_que_se_escapa() {
        let dir = tmp_dir("fuera");
        let afuera = dir.join("..");

        assert!(matches!(
            ensure_inside(&dir, &afuera),
            Err(LibraryError::OutsideDataDir)
        ));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn borrar_una_inexistente_no_es_error() {
        let dir = tmp_dir("borrar-inexistente");
        assert!(delete_files(&dir, "dQw4w9WgXcQ").is_ok());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn borrar_saca_la_carpeta_entera() {
        let dir = tmp_dir("borrar");
        let carpeta = song_dir(&dir, "dQw4w9WgXcQ");
        fs::create_dir_all(&carpeta).unwrap();
        fs::write(carpeta.join("audio.m4a"), b"audio").unwrap();

        delete_files(&dir, "dQw4w9WgXcQ").unwrap();
        assert!(!carpeta.exists());
        // Y no se llevó puesto el resto de la biblioteca.
        assert!(dir.exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
