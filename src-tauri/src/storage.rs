//! What the application keeps on this computer besides its records, and
//! clearing it (STORE-001–STORE-007): the call-sign files, updated road data,
//! unfinished downloads, and "before restore" safety copies. The map tile
//! cache lives in the webview and is measured and cleared there.

use crate::callsigns::Service;
use crate::datapacks::PACK_DEFS;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct StorageItem {
    /// Stable id the interface labels and passes back to `clear`.
    pub id: &'static str,
    pub files: u32,
    pub bytes: u64,
    /// The folder the item's files are kept in, so people can find them.
    pub location: String,
}

/// Where each kind of item lives.
pub struct Dirs<'a> {
    pub datapacks: &'a Path,
    pub restore_copies: &'a Path,
}

pub const ITEM_IDS: [&str; 5] =
    ["callsigns-amateur", "callsigns-gmrs", "road-data", "partial-downloads", "restore-copies"];

fn names_in(dir: &Path, keep: impl Fn(&str) -> bool) -> Vec<PathBuf> {
    let Ok(read) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut v: Vec<PathBuf> = read
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && p.file_name().and_then(|n| n.to_str()).is_some_and(&keep))
        .collect();
    v.sort();
    v
}

/// The files that make up one item. Only names the application itself
/// writes, so a stray file in these folders is never counted or removed.
fn files_for(id: &str, dirs: &Dirs) -> Option<Vec<PathBuf>> {
    let existing = |p: PathBuf| if p.is_file() { vec![p] } else { Vec::new() };
    Some(match id {
        "callsigns-amateur" => existing(dirs.datapacks.join(Service::Amateur.pack_file())),
        "callsigns-gmrs" => existing(dirs.datapacks.join(Service::Gmrs.pack_file())),
        "road-data" => PACK_DEFS
            .iter()
            .flat_map(|d| existing(dirs.datapacks.join(format!("{}.json", d.id))))
            .collect(),
        "partial-downloads" => names_in(dirs.datapacks, |n| n.ends_with(".part") || n.ends_with(".part.meta")),
        "restore-copies" => names_in(dirs.restore_copies, |n| n.starts_with("before-restore-") && n.ends_with(".db")),
        _ => return None,
    })
}

/// The folder an item's files live in.
fn folder_for<'a>(id: &str, dirs: &Dirs<'a>) -> &'a Path {
    match id {
        "restore-copies" => dirs.restore_copies,
        _ => dirs.datapacks,
    }
}

/// Every item, in a fixed order, including empty ones (STORE-002).
pub fn usage(dirs: &Dirs) -> Vec<StorageItem> {
    ITEM_IDS
        .iter()
        .map(|&id| {
            let files = files_for(id, dirs).unwrap_or_default();
            StorageItem {
                id,
                files: files.len() as u32,
                bytes: files.iter().filter_map(|f| std::fs::metadata(f).ok()).map(|m| m.len()).sum(),
                location: folder_for(id, dirs).display().to_string(),
            }
        })
        .collect()
}

/// Deletes one item's files (STORE-003, STORE-006). Keeping in-memory copies
/// in step is the caller's job (STORE-004).
pub fn clear(id: &str, dirs: &Dirs) -> Result<(), String> {
    let files = files_for(id, dirs).ok_or_else(|| format!("Unknown storage item: {id}"))?;
    for f in files {
        std::fs::remove_file(&f).map_err(|e| format!("Couldn't remove {}: {e}", f.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("roc-storage-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn write(dir: &Path, name: &str, len: usize) {
        std::fs::write(dir.join(name), vec![1u8; len]).unwrap();
    }

    /// A data folder with something of every kind, plus files that aren't ours.
    fn populated() -> (PathBuf, PathBuf) {
        let packs = temp("packs");
        let backups = temp("backups");
        write(&packs, Service::Amateur.pack_file(), 1000);
        write(&packs, Service::Gmrs.pack_file(), 300);
        write(&packs, &format!("{}.json", PACK_DEFS[0].id), 40);
        write(&packs, &format!("{}.json", PACK_DEFS[1].id), 60);
        write(&packs, "fcc-l_gmrs.zip.part", 500);
        write(&packs, "fcc-l_gmrs.zip.part.meta", 5);
        write(&packs, "notes.txt", 7);
        write(&backups, "before-restore-20260101-000000.db", 2000);
        write(&backups, "before-restore-20260102-000000.db", 2500);
        write(&backups, "my-own-backup.db", 9);
        (packs, backups)
    }

    fn item(items: &[StorageItem], id: &str) -> (u32, u64) {
        let i = items.iter().find(|i| i.id == id).unwrap_or_else(|| panic!("{id} missing"));
        (i.files, i.bytes)
    }

    #[test]
    fn measures_each_kind_and_lists_empty_ones_too() {
        let (packs, backups) = populated();
        let dirs = Dirs { datapacks: &packs, restore_copies: &backups };
        let items = usage(&dirs);
        assert_eq!(items.iter().map(|i| i.id).collect::<Vec<_>>(), ITEM_IDS.to_vec());
        assert_eq!(item(&items, "callsigns-amateur"), (1, 1000));
        assert_eq!(item(&items, "callsigns-gmrs"), (1, 300));
        assert_eq!(item(&items, "road-data"), (2, 100));
        assert_eq!(item(&items, "partial-downloads"), (2, 505));
        assert_eq!(item(&items, "restore-copies"), (2, 4500));
        let location = |id: &str| items.iter().find(|i| i.id == id).unwrap().location.clone();
        assert_eq!(location("callsigns-amateur"), packs.display().to_string());
        assert_eq!(location("road-data"), packs.display().to_string());
        assert_eq!(location("partial-downloads"), packs.display().to_string());
        assert_eq!(location("restore-copies"), backups.display().to_string());

        let empty = temp("empty");
        let none = usage(&Dirs { datapacks: &empty, restore_copies: &empty.join("missing") });
        assert_eq!(none.len(), ITEM_IDS.len());
        assert!(none.iter().all(|i| i.files == 0 && i.bytes == 0));
    }

    #[test]
    fn clearing_removes_only_that_items_files() {
        let (packs, backups) = populated();
        let dirs = Dirs { datapacks: &packs, restore_copies: &backups };
        for id in ITEM_IDS {
            clear(id, &dirs).unwrap();
            assert_eq!(item(&usage(&dirs), id), (0, 0), "{id}");
        }
        assert!(packs.join("notes.txt").exists(), "not ours");
        assert!(backups.join("my-own-backup.db").exists(), "not ours");
    }

    #[test]
    fn clearing_one_leaves_the_others() {
        let (packs, backups) = populated();
        let dirs = Dirs { datapacks: &packs, restore_copies: &backups };
        clear("callsigns-gmrs", &dirs).unwrap();
        let items = usage(&dirs);
        assert_eq!(item(&items, "callsigns-gmrs"), (0, 0));
        assert_eq!(item(&items, "callsigns-amateur"), (1, 1000));
        assert_eq!(item(&items, "partial-downloads"), (2, 505));
    }

    #[test]
    fn unknown_items_are_refused() {
        let (packs, backups) = populated();
        assert!(clear("database", &Dirs { datapacks: &packs, restore_copies: &backups }).is_err());
    }
}
