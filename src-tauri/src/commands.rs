//! Comandos expuestos al frontend.
//!
//! Son finos a propósito: validan la entrada, resuelven la ruta y delegan al
//! módulo de dominio. Toda la lógica testeable vive en `scores.rs`.

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::scores::{self, Entry, ScoreError};

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
