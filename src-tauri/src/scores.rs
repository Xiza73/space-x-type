//! Ranking local.
//!
//! Dominio puro más lectura/escritura en disco. Los comandos de Tauri viven en
//! `commands.rs` y solo validan y delegan acá.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// El nombre entra en una casilla del ranking; más largo no se lee.
pub const MAX_NAME_LEN: usize = 10;
/// Cuántas entradas se guardan **por modo**.
pub const TOP_N: usize = 5;
/// Versión del esquema. Va desde el día uno: migrar después sale mucho más caro.
pub const SCHEMA_VERSION: u32 = 1;

const FALLBACK_NAME: &str = "PLAYER";

#[derive(Debug, thiserror::Error)]
pub enum ScoreError {
    #[error("no se pudo resolver el directorio de datos de la app")]
    NoDataDir,
    #[error("error de disco: {0}")]
    Io(#[from] std::io::Error),
    #[error("no se pudo serializar el ranking: {0}")]
    Encode(#[from] serde_json::Error),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub score: u32,
    pub max_combo: u32,
    /// Clave de la configuración jugada. Los puntajes de modos distintos no se
    /// comparan entre sí, así que cada modo tiene su tabla.
    pub mode: String,
    /// Segundos desde epoch.
    pub at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Board {
    pub version: u32,
    pub entries: Vec<Entry>,
}

impl Default for Board {
    fn default() -> Self {
        Self {
            version: SCHEMA_VERSION,
            entries: Vec::new(),
        }
    }
}

/// Deja el nombre en algo que entre en la casilla y no traiga sorpresas.
///
/// El nombre lo escribe el jugador, así que es entrada no confiable aunque la
/// app sea de un solo usuario: se filtra a A–Z, dígitos y espacio.
pub fn sanitize_name(raw: &str) -> String {
    let cleaned: String = raw
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ')
        .take(MAX_NAME_LEN)
        .collect();

    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        FALLBACK_NAME.to_string()
    } else {
        trimmed.to_string()
    }
}

/// Top del modo pedido, de mayor a menor.
pub fn top_of(entries: &[Entry], mode: &str) -> Vec<Entry> {
    let mut found: Vec<Entry> = entries.iter().filter(|e| e.mode == mode).cloned().collect();
    found.sort_by(|a, b| b.score.cmp(&a.score).then(a.at.cmp(&b.at)));
    found.truncate(TOP_N);
    found
}

/// Agrega una entrada y recorta el modo afectado a `TOP_N`.
///
/// Solo se recorta el modo que cambió: los demás no se tocan.
pub fn insert(entries: &[Entry], entry: Entry) -> Vec<Entry> {
    let mode = entry.mode.clone();

    let mut same_mode: Vec<Entry> = entries.iter().filter(|e| e.mode == mode).cloned().collect();
    same_mode.push(entry);
    same_mode.sort_by(|a, b| b.score.cmp(&a.score).then(a.at.cmp(&b.at)));
    same_mode.truncate(TOP_N);

    let mut out: Vec<Entry> = entries.iter().filter(|e| e.mode != mode).cloned().collect();
    out.extend(same_mode);
    out
}

pub fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn board_path(data_dir: &Path) -> PathBuf {
    data_dir.join("scores.json")
}

/// Lee el ranking del disco.
///
/// Si el archivo no existe todavía, arranca vacío. Si está corrupto **no se
/// descarta en silencio**: se respalda a `scores.corrupt.json` y se sigue con
/// una tabla nueva. Perder puntajes sin avisar es peor que perderlos.
pub fn read_board(path: &Path) -> Result<Board, ScoreError> {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Board::default()),
        Err(e) => return Err(e.into()),
    };

    match serde_json::from_str::<Board>(&raw) {
        Ok(board) => Ok(board),
        Err(_) => {
            let _ = fs::rename(path, path.with_extension("corrupt.json"));
            Ok(Board::default())
        }
    }
}

/// Escribe el ranking de forma **atómica**: temporal y después rename.
///
/// Escribir en el lugar deja el archivo ilegible si el proceso muere a mitad
/// de camino, y ahí perdés todos los puntajes de una.
pub fn write_board(path: &Path, board: &Board) -> Result<(), ScoreError> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }

    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(board)?)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, score: u32, mode: &str, at: u64) -> Entry {
        Entry {
            name: name.to_string(),
            score,
            max_combo: 0,
            mode: mode.to_string(),
            at,
        }
    }

    #[test]
    fn sanitiza_a_mayuscula_y_recorta() {
        assert_eq!(sanitize_name("xiza"), "XIZA");
        assert_eq!(sanitize_name("unnombrelarguisimo"), "UNNOMBRELA");
        assert_eq!(sanitize_name("  ab  "), "AB");
    }

    #[test]
    fn descarta_caracteres_raros() {
        assert_eq!(sanitize_name("a<script>"), "ASCRIPT");
        assert_eq!(sanitize_name("../../etc"), "ETC");
        assert_eq!(sanitize_name("ñoño"), "OO");
    }

    #[test]
    fn cae_a_un_nombre_por_defecto_si_no_queda_nada() {
        assert_eq!(sanitize_name(""), FALLBACK_NAME);
        assert_eq!(sanitize_name("!!!"), FALLBACK_NAME);
        assert_eq!(sanitize_name("   "), FALLBACK_NAME);
    }

    #[test]
    fn ordena_de_mayor_a_menor() {
        let entries = vec![
            entry("A", 100, "arcade", 1),
            entry("B", 300, "arcade", 2),
            entry("C", 200, "arcade", 3),
        ];
        let top = top_of(&entries, "arcade");
        assert_eq!(
            top.iter().map(|e| e.score).collect::<Vec<_>>(),
            vec![300, 200, 100]
        );
    }

    #[test]
    fn empata_a_favor_del_primero_en_llegar() {
        let entries = vec![entry("TARDE", 100, "arcade", 20), entry("TEMPRANO", 100, "arcade", 10)];
        assert_eq!(top_of(&entries, "arcade")[0].name, "TEMPRANO");
    }

    #[test]
    fn no_mezcla_modos() {
        let entries = vec![
            entry("ARCADE", 9999, "arrows-arcade", 1),
            entry("CANCION", 100, "words-song", 2),
        ];
        // Un puntaje de arcade infinito no puede tapar la tabla de canción.
        assert_eq!(top_of(&entries, "words-song").len(), 1);
        assert_eq!(top_of(&entries, "words-song")[0].name, "CANCION");
    }

    #[test]
    fn recorta_a_cinco_por_modo() {
        let mut entries = Vec::new();
        for i in 0..8 {
            entries = insert(&entries, entry("N", i * 10, "arcade", i as u64));
        }
        assert_eq!(top_of(&entries, "arcade").len(), TOP_N);
        assert_eq!(top_of(&entries, "arcade")[0].score, 70);
    }

    #[test]
    fn recortar_un_modo_no_toca_los_otros() {
        let mut entries = vec![entry("OTRO", 5, "song", 0)];
        for i in 0..8 {
            entries = insert(&entries, entry("N", i * 10, "arcade", i as u64));
        }
        assert_eq!(top_of(&entries, "song").len(), 1);
        assert_eq!(top_of(&entries, "song")[0].name, "OTRO");
    }

    #[test]
    fn un_puntaje_bajo_no_entra_si_la_tabla_esta_llena() {
        let mut entries = Vec::new();
        for i in 1..=TOP_N {
            entries = insert(&entries, entry("N", (i as u32) * 100, "arcade", i as u64));
        }
        entries = insert(&entries, entry("FLOJO", 1, "arcade", 99));
        assert!(!top_of(&entries, "arcade").iter().any(|e| e.name == "FLOJO"));
    }

    #[test]
    fn arranca_vacio_si_el_archivo_no_existe() {
        let dir = std::env::temp_dir().join("sxt-scores-inexistente");
        let _ = fs::remove_dir_all(&dir);
        let board = read_board(&board_path(&dir)).unwrap();
        assert!(board.entries.is_empty());
        assert_eq!(board.version, SCHEMA_VERSION);
    }

    #[test]
    fn ida_y_vuelta_por_disco() {
        let dir = std::env::temp_dir().join("sxt-scores-roundtrip");
        let _ = fs::remove_dir_all(&dir);
        let path = board_path(&dir);

        let board = Board {
            version: SCHEMA_VERSION,
            entries: vec![entry("XIZA", 1000, "arrows-arcade", 42)],
        };
        write_board(&path, &board).unwrap();

        let leido = read_board(&path).unwrap();
        assert_eq!(leido.entries, board.entries);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn respalda_en_vez_de_descartar_un_archivo_corrupto() {
        let dir = std::env::temp_dir().join("sxt-scores-corrupto");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = board_path(&dir);
        fs::write(&path, "{ esto no es json").unwrap();

        let board = read_board(&path).unwrap();
        assert!(board.entries.is_empty());
        // Lo importante: el archivo original sigue existiendo, con otro nombre.
        assert!(path.with_extension("corrupt.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_deja_temporales_dando_vueltas() {
        let dir = std::env::temp_dir().join("sxt-scores-tmp");
        let _ = fs::remove_dir_all(&dir);
        let path = board_path(&dir);

        write_board(&path, &Board::default()).unwrap();
        assert!(!path.with_extension("json.tmp").exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
