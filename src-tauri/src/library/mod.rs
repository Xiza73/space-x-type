//! Biblioteca personal de canciones.
//!
//! Procesar una canción es una operación de **una sola vez**: si la URL ya está
//! en la biblioteca y el audio sigue en el disco, se reusa y no se vuelve a
//! descargar nada.

pub mod analysis;
pub mod source;
pub mod store;
pub mod tooling;
mod ytdlp;

use std::path::Path;

use serde::Serialize;

use crate::jsonstore;
pub use store::{LibraryError, Library, Song};

/// Qué pasó al procesar. El frontend muestra distinto si fue descarga o reuso.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Processed {
    pub song: Song,
    /// `true` si ya estaba en la biblioteca y no se descargó nada.
    pub reused: bool,
}

/// Lista la biblioteca, marcando como rotas las entradas cuyo audio no está.
pub fn list(data_dir: &Path) -> Result<Vec<SongStatus>, LibraryError> {
    let library: Library = jsonstore::read_or_default(&store::index_path(data_dir))?;
    Ok(library
        .songs
        .into_iter()
        .map(|song| SongStatus {
            intact: store::is_intact(data_dir, &song),
            bpm_range: song.bpm.map(analysis::suggested_range),
            song,
        })
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongStatus {
    #[serde(flatten)]
    pub song: Song,
    /// `false` si el índice la tiene pero el audio no está en el disco.
    pub intact: bool,
    /// Rango sugerido para corregir el tempo a mano. `None` si no hay medición.
    ///
    /// Se calcula aquí y no en el frontend para que la regla viva en un solo
    /// lugar: es la misma que valida el comando que guarda la corrección.
    pub bpm_range: Option<(f32, f32)>,
}

/// Valida la URL, descarga el audio si hace falta y deja la entrada en el índice.
pub fn process(data_dir: &Path, raw_url: &str) -> Result<Processed, LibraryError> {
    // 1. La URL es lo primero que se valida. Nada toca el disco ni un proceso
    //    externo antes de que esto pase.
    let id = source::video_id(raw_url)?;

    let index = store::index_path(data_dir);
    let library: Library = jsonstore::read_or_default(&index)?;

    // 2. Deduplicación: procesar es una sola vez por canción. Solo cuenta si el
    //    audio sigue realmente en el disco — el índice puede estar desfasado.
    if let Some(existing) = store::find(&library.songs, &id) {
        if store::is_intact(data_dir, existing) {
            return Ok(Processed { song: existing.clone(), reused: true });
        }
    }

    // 3. Las herramientas externas, antes de tocar la red por la canción: si
    //    falta yt-dlp se descarga una sola vez, y si falta el runtime de
    //    JavaScript YouTube devolvería un 403 que no explica nada.
    let herramientas = ytdlp::Tools::resolve(data_dir)?;

    // 4. La duración se valida **antes** de bajar el archivo. Descargar dos
    //    horas de audio para después decir "es muy largo" es exactamente lo que
    //    no hay que hacer, y cuesta solo una llamada corta averiguarlo.
    let seconds = ytdlp::probe_duration(&herramientas, raw_url)?;
    if seconds < ytdlp::MIN_DURATION_SEC {
        return Err(LibraryError::TooShort { seconds, min: ytdlp::MIN_DURATION_SEC });
    }
    if seconds > ytdlp::MAX_DURATION_SEC {
        return Err(LibraryError::TooLong { seconds, max: ytdlp::MAX_DURATION_SEC });
    }

    // 5. La carpeta se arma con el id ya validado, y se verifica igual.
    let dir = store::song_dir(data_dir, &id);
    std::fs::create_dir_all(&dir)?;
    store::ensure_inside(data_dir, &dir)?;

    let downloaded = ytdlp::download(&herramientas, raw_url, &dir, store::audio_stem())?;

    // 6. Analizar es parte de procesar: si la canción queda sin beatmap, no se
    //    puede jugar, y "está en la biblioteca pero no sirve" es peor que un
    //    error claro aquí.
    let beatmap = analysis::analyze(&dir.join(&downloaded.file_name))?;
    jsonstore::write_atomic(&store::beatmap_path(data_dir, &id), &beatmap)?;

    let song = Song {
        id,
        title: downloaded.title,
        // La duración del audio decodificado le gana a la que reporta yt-dlp:
        // es la que realmente va a sonar. Si por lo que sea quedó en cero, se
        // usa la de los metadatos.
        duration_sec: if beatmap.duration_ms > 0 {
            beatmap.duration_ms / 1000
        } else {
            downloaded.duration_sec
        },
        url: raw_url.trim().to_string(),
        audio_file: downloaded.file_name,
        added_at: store::now_seconds(),
        bpm: Some(beatmap.bpm),
        bpm_override: None,
    };

    let songs = store::upsert(&library.songs, song.clone());
    jsonstore::write_atomic(
        &index,
        &Library { version: store::SCHEMA_VERSION, songs },
    )?;

    Ok(Processed { song, reused: false })
}

/// Beatmap de una canción ya procesada, con la corrección de tempo aplicada.
///
/// El archivo en disco guarda siempre el análisis original: la corrección vive
/// en el índice y se aplica al leer. Así se puede volver al detectado sin
/// reprocesar la canción.
pub fn beatmap(data_dir: &Path, raw_id: &str) -> Result<analysis::Beatmap, LibraryError> {
    if !is_safe_id(raw_id) {
        return Err(LibraryError::OutsideDataDir);
    }

    let path = store::beatmap_path(data_dir, raw_id);
    let raw = std::fs::read_to_string(&path).map_err(|_| LibraryError::NotFound)?;

    let detected: analysis::Beatmap = serde_json::from_str(&raw).map_err(|e| {
        log::error!("beatmap ilegible en {}: {e}", path.display());
        LibraryError::Analysis
    })?;

    let library: Library = jsonstore::read_or_default(&store::index_path(data_dir))?;
    match store::find(&library.songs, raw_id).and_then(|s| s.bpm_override) {
        Some(bpm) => Ok(analysis::with_bpm(&detected, bpm)),
        None => Ok(detected),
    }
}

/// Guarda una corrección manual del tempo. `None` vuelve al detectado.
pub fn set_bpm(data_dir: &Path, raw_id: &str, bpm: Option<f32>) -> Result<Song, LibraryError> {
    if !is_safe_id(raw_id) {
        return Err(LibraryError::OutsideDataDir);
    }

    let index = store::index_path(data_dir);
    let library: Library = jsonstore::read_or_default(&index)?;
    let mut song = store::find(&library.songs, raw_id).ok_or(LibraryError::NotFound)?.clone();

    // El valor llega del frontend: se acota aquí, que es donde se escribe.
    // Un tempo de cero dividiría por cero al armar la grilla.
    song.bpm_override = bpm.filter(|v| v.is_finite()).map(analysis::clamp_bpm);

    let songs = store::upsert(&library.songs, song.clone());
    jsonstore::write_atomic(&index, &Library { version: store::SCHEMA_VERSION, songs })?;

    Ok(song)
}

/// Bytes del audio de una canción.
///
/// Se mandan por IPC en vez de exponer el archivo con el protocolo de assets:
/// así la ruta **nunca sale de Rust**, no hay que aflojar la CSP y no hay un
/// scope de globs que se pueda configurar mal.
pub fn audio_bytes(data_dir: &Path, raw_id: &str) -> Result<Vec<u8>, LibraryError> {
    if !is_safe_id(raw_id) {
        return Err(LibraryError::OutsideDataDir);
    }

    let library: Library = jsonstore::read_or_default(&store::index_path(data_dir))?;
    let song = store::find(&library.songs, raw_id).ok_or(LibraryError::NotFound)?;

    // `audio_file` sale del índice, que es un archivo editable a mano: se trata
    // como entrada no confiable igual que todo lo demás.
    if song.audio_file.contains('/') || song.audio_file.contains('\\') {
        return Err(LibraryError::OutsideDataDir);
    }

    let path = store::song_dir(data_dir, raw_id).join(&song.audio_file);
    store::ensure_inside(data_dir, &path)?;

    Ok(std::fs::read(path)?)
}

/// Borra una canción: los archivos **y** la entrada del índice.
pub fn delete(data_dir: &Path, raw_id: &str) -> Result<(), LibraryError> {
    // El id llega del frontend, así que se revalida aquí antes de tocar el
    // disco. Un borrado recursivo con la ruta equivocada no tiene deshacer.
    if !is_safe_id(raw_id) {
        return Err(LibraryError::OutsideDataDir);
    }

    store::delete_files(data_dir, raw_id)?;

    let index = store::index_path(data_dir);
    let library: Library = jsonstore::read_or_default(&index)?;
    let songs = store::remove(&library.songs, raw_id);
    jsonstore::write_atomic(&index, &Library { version: store::SCHEMA_VERSION, songs })?;

    Ok(())
}

/// Misma forma que garantiza `source::video_id`. Se comprueba de nuevo porque
/// el id que llega para borrar no pasó por el parseo de la URL.
fn is_safe_id(id: &str) -> bool {
    id.len() == 11
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_id_valido_pasa() {
        assert!(is_safe_id("dQw4w9WgXcQ"));
        assert!(is_safe_id("_-_-_-_-_-_"));
    }

    #[test]
    fn un_id_que_se_escapa_no_pasa() {
        for malo in ["../../etc", "..", "a/b", "a\\b", "corto", "", "dQw4w9WgXc."] {
            assert!(!is_safe_id(malo), "dejó pasar {malo}");
        }
    }

    #[test]
    fn borrar_con_un_id_hostil_no_toca_el_disco() {
        let dir = std::env::temp_dir().join("sxt-library-borrado-hostil");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let testigo = dir.join("no-me-borres.txt");
        std::fs::write(&testigo, b"intacto").unwrap();

        assert!(matches!(delete(&dir, "../.."), Err(LibraryError::OutsideDataDir)));
        assert!(testigo.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn una_url_invalida_no_llega_al_disco() {
        let dir = std::env::temp_dir().join("sxt-library-url-invalida");
        let _ = std::fs::remove_dir_all(&dir);

        assert!(process(&dir, "https://evil.com/watch?v=dQw4w9WgXcQ").is_err());
        // Ni siquiera se creó el directorio: la validación va primero.
        assert!(!dir.exists());
    }
}
