//! Comandos expuestos al frontend.
//!
//! Son finos a propósito: validan la entrada, resuelven la ruta y delegan al
//! módulo de dominio. Toda la lógica testeable vive en `scores.rs`.

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::library::{self, LibraryError, Processed, SongStatus};
use crate::scores::{self, Entry, ScoreError};

fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "no se pudo resolver el directorio de datos de la app".to_string())
}

/// El detalle del error va al log; al usuario le llega el mensaje y nada más.
fn library_message(error: LibraryError) -> String {
    log::error!("biblioteca: {error}");
    error.to_string()
}

#[tauri::command]
pub async fn process_song(app: AppHandle, url: String) -> Result<Processed, String> {
    let dir = data_dir(&app)?;
    // La descarga tarda decenas de segundos: va a un hilo bloqueante para no
    // trabar el runtime async de Tauri.
    tauri::async_runtime::spawn_blocking(move || library::process(&dir, &url))
        .await
        .map_err(|_| "la descarga se interrumpió".to_string())?
        .map_err(library_message)
}

#[tauri::command]
pub fn list_songs(app: AppHandle) -> Result<Vec<SongStatus>, String> {
    let dir = data_dir(&app)?;
    library::list(&dir).map_err(library_message)
}

#[tauri::command]
pub fn delete_song(app: AppHandle, id: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    library::delete(&dir, &id).map_err(library_message)
}

#[tauri::command]
pub fn song_beatmap(app: AppHandle, id: String) -> Result<library::analysis::Beatmap, String> {
    let dir = data_dir(&app)?;
    library::beatmap(&dir, &id).map_err(library_message)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewScore {
    pub name: String,
    pub score: u32,
    pub max_combo: u32,
    pub mode: String,
}

/// El frontend no maneja `ScoreError`, así que se traduce en la frontera.
/// El detalle queda en el log; al usuario le llega un mensaje y nada más.
fn to_message(error: ScoreError) -> String {
    log::error!("ranking: {error}");
    error.to_string()
}

fn board_path(app: &AppHandle) -> Result<std::path::PathBuf, ScoreError> {
    let dir = app.path().app_data_dir().map_err(|_| ScoreError::NoDataDir)?;
    Ok(scores::board_path(&dir))
}

#[tauri::command]
pub fn load_scores(app: AppHandle, mode: String) -> Result<Vec<Entry>, String> {
    let path = board_path(&app).map_err(to_message)?;
    let board = scores::read_board(&path).map_err(to_message)?;
    Ok(scores::top_of(&board.entries, &mode))
}

#[tauri::command]
pub fn save_score(app: AppHandle, entry: NewScore) -> Result<Vec<Entry>, String> {
    let path = board_path(&app).map_err(to_message)?;
    let mut board = scores::read_board(&path).map_err(to_message)?;

    board.entries = scores::insert(
        &board.entries,
        Entry {
            name: scores::sanitize_name(&entry.name),
            score: entry.score,
            max_combo: entry.max_combo,
            mode: entry.mode.clone(),
            at: scores::now_seconds(),
        },
    );

    scores::write_board(&path, &board).map_err(to_message)?;
    Ok(scores::top_of(&board.entries, &entry.mode))
}
