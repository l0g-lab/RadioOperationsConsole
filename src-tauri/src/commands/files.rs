use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

/// The webview may only write files the operator picked in a save dialog (the
/// dialog adds exactly that path to the file-system scope). Some dialogs (GTK
/// in particular) drop the file type's extension when a name is typed without
/// one, and the app then adds it back — a slightly different path the dialog
/// never granted. This grants that one sibling path, and only when `path`
/// itself was granted, so the webview can't use it to reach anywhere else.
#[tauri::command]
pub fn allow_export_extension(app: AppHandle, path: String, ext: String) -> Result<String, String> {
    let with_ext = with_extension(&path, &ext)?;
    let scope = app.fs_scope();
    if !scope.is_allowed(&path) {
        return Err("That file wasn't chosen in a save dialog.".into());
    }
    scope.allow_file(&with_ext).map_err(|e| e.to_string())?;
    Ok(with_ext)
}

/// `path` with `.ext` added, refusing anything but a short plain extension.
fn with_extension(path: &str, ext: &str) -> Result<String, String> {
    if ext.is_empty() || ext.len() > 5 || !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(format!("\"{ext}\" isn't a file extension."));
    }
    Ok(format!("{path}.{ext}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_plain_extension_can_be_added() {
        assert_eq!(with_extension("/home/pat/net", "csv").unwrap(), "/home/pat/net.csv");
        for bad in ["", "csv/../../x", "a.b", "toolong"] {
            assert!(with_extension("/home/pat/net", bad).is_err(), "{bad}");
        }
    }
}
