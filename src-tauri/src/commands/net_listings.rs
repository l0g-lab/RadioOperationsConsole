use super::AppState;
use crate::net_listings::{self, NetListing, NetListingDetails};
use tauri::State;

/// The net listings: in use, or with `retired`, the retired ones (NETL-010).
#[tauri::command]
pub fn list_net_listings(state: State<AppState>, retired: bool) -> Result<Vec<NetListing>, String> {
    state.repo.lock().unwrap().list_net_listings(retired).map_err(|e| e.to_string())
}

/// Adds a listing, or with `listing_id` replaces one's details, recording the
/// change. Returns its id.
#[tauri::command]
pub fn save_net_listing(
    state: State<AppState>,
    listing_id: Option<String>,
    details: NetListingDetails,
    operator_id: Option<String>,
) -> Result<String, String> {
    let details = net_listings::clean(details)?;
    let repo = state.repo.lock().unwrap();
    if let Some(rid) = &details.repeater_id {
        if !repo.repeater_exists(rid).map_err(|e| e.to_string())? {
            return Err("That repeater is no longer in the directory.".into());
        }
    }
    let Some(id) = listing_id else {
        let id = repo.create_net_listing(&details).map_err(|e| e.to_string())?;
        let data = serde_json::json!({ "after": details }).to_string();
        repo.create_audit_event("net_listing", &id, "create", Some(&data), operator_id.as_deref())
            .map_err(|e| e.to_string())?;
        return Ok(id);
    };
    let before = repo.get_net_listing(&id).map_err(|_| "That net listing no longer exists.".to_string())?;
    repo.update_net_listing(&id, &details).map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "before": before.details, "after": details }).to_string();
    repo.create_audit_event("net_listing", &id, "correct", Some(&data), operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Retires (hides) or restores a listing. Activities are never changed (NETL-011).
#[tauri::command]
pub fn set_net_listing_retired(
    state: State<AppState>,
    listing_id: String,
    retired: bool,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    repo.set_net_listing_retired(&listing_id, retired).map_err(|e| e.to_string())?;
    let action = if retired { "retire" } else { "restore" };
    repo.create_audit_event("net_listing", &listing_id, action, None, operator_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(())
}
