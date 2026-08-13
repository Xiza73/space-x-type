//! Lectura y escritura de JSON en disco, con las dos garantías que no se pueden
//! implementar dos veces distinto: **escritura atómica** y **nunca descartar en
//! silencio un archivo corrupto**.
//!
//! Lo usan el ranking y la biblioteca. Que exista una sola implementación no es
//! orden: son datos que el usuario acumula y no puede volver a generar.

use std::fs;
use std::path::Path;

use serde::{de::DeserializeOwned, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("error de disco: {0}")]
    Io(#[from] std::io::Error),
    #[error("no se pudo serializar: {0}")]
    Encode(#[from] serde_json::Error),
}

/// Lee un JSON del disco.
///
/// - Si el archivo no existe, devuelve el valor por defecto.
/// - Si está corrupto, lo **respalda** a `<nombre>.corrupt.json` y devuelve el
///   valor por defecto. Descartarlo en silencio sería perder datos del usuario
///   sin avisar, que es peor que perderlos.
pub fn read_or_default<T: DeserializeOwned + Default>(path: &Path) -> Result<T, StoreError> {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(T::default()),
        Err(e) => return Err(e.into()),
    };

    match serde_json::from_str::<T>(&raw) {
        Ok(value) => Ok(value),
        Err(e) => {
            log::error!("archivo corrupto en {}: {e}", path.display());
            let _ = fs::rename(path, path.with_extension("corrupt.json"));
            Ok(T::default())
        }
    }
}

/// Escribe un JSON de forma atómica: temporal y después rename.
///
/// Escribir en el lugar deja el archivo ilegible si el proceso muere a mitad de
/// camino, y ahí se pierde todo de una.
pub fn write_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), StoreError> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }

    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(value)?)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
    struct Doc {
        version: u32,
        items: Vec<String>,
    }

    fn tmp_dir(nombre: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("sxt-jsonstore-{nombre}"));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn arranca_por_defecto_si_no_existe() {
        let path = tmp_dir("inexistente").join("doc.json");
        assert_eq!(read_or_default::<Doc>(&path).unwrap(), Doc::default());
    }

    #[test]
    fn ida_y_vuelta() {
        let dir = tmp_dir("roundtrip");
        let path = dir.join("doc.json");
        let doc = Doc { version: 3, items: vec!["a".into(), "b".into()] };

        write_atomic(&path, &doc).unwrap();
        assert_eq!(read_or_default::<Doc>(&path).unwrap(), doc);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn crea_el_directorio_si_falta() {
        let dir = tmp_dir("crea-dir");
        let path = dir.join("hondo").join("doc.json");

        write_atomic(&path, &Doc::default()).unwrap();
        assert!(path.exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn respalda_en_vez_de_descartar_un_corrupto() {
        let dir = tmp_dir("corrupto");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("doc.json");
        fs::write(&path, "{ esto no es json").unwrap();

        assert_eq!(read_or_default::<Doc>(&path).unwrap(), Doc::default());
        // Lo que importa: el original sigue existiendo, con otro nombre.
        assert!(path.with_extension("corrupt.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_deja_temporales() {
        let dir = tmp_dir("temporales");
        let path = dir.join("doc.json");

        write_atomic(&path, &Doc::default()).unwrap();
        assert!(!path.with_extension("json.tmp").exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
