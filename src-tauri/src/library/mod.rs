//! Biblioteca personal de canciones.
//!
//! Procesar una canción es una operación de **una sola vez**: si la URL ya está
//! en la biblioteca y el audio sigue en el disco, se reusa y no se vuelve a
//! descargar nada.

pub mod source;
pub mod store;
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
        .map(|song| SongStatus { intact: store::is_intact(data_dir, &song), song })
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongStatus {
    #[serde(flatten)]
    pub song: Song,
    /// `false` si el índice la tiene pero el audio no está en el disco.
    pub intact: bool,
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

    // 3. La carpeta se arma con el id ya validado, y se verifica igual.
    let dir = store::song_dir(data_dir, &id);
    std::fs::create_dir_all(&dir)?;
    store::ensure_inside(data_dir, &dir)?;

    let downloaded = ytdlp::download(raw_url, &dir, store::audio_stem())?;

    let song = Song {
        id,
        title: downloaded.title,
        duration_sec: downloaded.duration_sec,
        url: raw_url.trim().to_string(),
        audio_file: downloaded.file_name,
        added_at: store::now_seconds(),
        bpm: None,
    };

    let songs = store::upsert(&library.songs, song.clone());
    jsonstore::write_atomic(
        &index,
        &Library { version: store::SCHEMA_VERSION, songs },
    )?;

    Ok(Processed { song, reused: false })
}

/// Borra una canción: los archivos **y** la entrada del índice.
pub fn delete(data_dir: &Path, raw_id: &str) -> Result<(), LibraryError> {
    // El id llega del frontend, así que se revalida acá antes de tocar el
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
