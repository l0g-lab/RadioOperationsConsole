use super::{ensure_checkin_open, ensure_open, AppState};
use crate::range_check;
use crate::repo::{Checkin, ContactDetails, Repository, StationHistory};
use tauri::State;

/// The activity type of the activity a check-in belongs to, if it can be found.
fn checkin_activity_type(repo: &Repository, checkin_id: &str) -> Option<String> {
    let activity_id = repo.activity_id_of_checkin(checkin_id)?;
    repo.get_activity(&activity_id).ok().map(|a| a.activity_type)
}

/// Checks the contact's time and stores it in one form (UTC, RFC 3339), so
/// contacts sort correctly whatever offset the interface sent.
fn normalize_contact(contact: Option<ContactDetails>) -> Result<Option<ContactDetails>, String> {
    let Some(mut c) = contact else { return Ok(None) };
    c.contacted_at = normalize_time(c.contacted_at.as_deref(), "contact")?;
    Ok(Some(c))
}

/// A given time checked and stored as UTC; blank means "not given".
fn normalize_time(at: Option<&str>, what: &str) -> Result<Option<String>, String> {
    let Some(at) = at.map(str::trim).filter(|t| !t.is_empty()) else { return Ok(None) };
    let parsed = chrono::DateTime::parse_from_rfc3339(at)
        .map_err(|_| format!("The {what} time \"{at}\" isn't a valid date and time."))?;
    Ok(Some(parsed.with_timezone(&chrono::Utc).to_rfc3339()))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_checkin(
    state: State<AppState>,
    activity_id: String,
    call_sign: String,
    name: Option<String>,
    qth_location: Option<String>,
    grid_square: Option<String>,
    address: Option<String>,
    operator_id: Option<String>,
    location_lat: Option<f64>,
    location_lon: Option<f64>,
    location_label: Option<String>,
    has_traffic: bool,
    traffic: Option<String>,
    contact: Option<ContactDetails>,
    location_manual: Option<bool>,
    location_how: Option<String>,
) -> Result<String, String> {
    let mut contact = normalize_contact(contact)?.unwrap_or_default();
    let repo = state.repo.lock().unwrap();
    ensure_open(&repo, &activity_id)?;
    let activity = repo.get_activity(&activity_id).map_err(|e| e.to_string())?;
    let range = range_check::is_range_check(&activity.activity_type);
    if range {
        // RANGE-002, RANGE-011
        if activity.repeater_lat.is_none() || activity.repeater_lon.is_none() {
            return Err(range_check::NEEDS_REPEATER.to_string());
        }
        range_check::normalize(&mut contact);
        range_check::validate(&contact, location_lat.is_some() && location_lon.is_some())?;
    }
    let id = repo.create_checkin(
            &activity_id,
            &call_sign,
            name.as_deref(),
            qth_location.as_deref(),
            grid_square.as_deref(),
            address.as_deref(),
            operator_id.as_deref(),
            location_lat,
            location_lon,
            location_label.as_deref(),
            has_traffic,
            traffic.as_deref(),
            &contact,
        )
        .map_err(|e| e.to_string())?;
    // A range check's point is always pinned by hand (RANGE-014).
    if location_lat.is_some() && (range || location_manual == Some(true)) {
        repo.mark_checkin_location_manual(&id).map_err(|e| e.to_string())?;
    }
    let how = if range && location_lat.is_some() { Some("pin".to_string()) } else { location_how };
    if let Some(how) = how.filter(|_| location_lat.is_some()) {
        repo.set_checkin_location_how(&id, &how).map_err(|e| e.to_string())?;
    }
    Ok(id)
}

/// Earlier records of a call sign across every activity: the "worked
/// before" line on the entry form.
#[tauri::command]
pub fn station_history(state: State<AppState>, call_sign: String) -> Result<StationHistory, String> {
    state.repo.lock().unwrap().station_history(&call_sign).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_checkins(state: State<AppState>, activity_id: String) -> Result<Vec<Checkin>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_checkins(&activity_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_voided_checkins(
    state: State<AppState>,
    activity_id: String,
) -> Result<Vec<Checkin>, String> {
    state
        .repo
        .lock()
        .unwrap()
        .list_voided_checkins(&activity_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_checkin(
    state: State<AppState>,
    checkin_id: String,
    call_sign: String,
    name: Option<String>,
    qth_location: Option<String>,
    grid_square: Option<String>,
    address: Option<String>,
    operator_id: Option<String>,
    location_lat: Option<f64>,
    location_lon: Option<f64>,
    location_label: Option<String>,
    has_traffic: bool,
    traffic: Option<String>,
    contact: Option<ContactDetails>,
    checked_in_at: Option<String>,
    location_how: Option<String>,
) -> Result<(), String> {
    let mut contact = normalize_contact(contact)?;
    // A net check-in's time, corrected without contact details (LIFE-013).
    let checked_in_at = normalize_time(checked_in_at.as_deref(), "check-in")?;
    let repo = state.repo.lock().unwrap();
    if checkin_activity_type(&repo, &checkin_id).is_some_and(|t| range_check::is_range_check(&t)) {
        // RANGE-017: a correction meets the same rules. Without contact
        // details (a call-sign lookup) they're unchanged, but the point stays.
        let has_point = location_lat.is_some() && location_lon.is_some();
        match contact.as_mut() {
            Some(c) => {
                range_check::normalize(c);
                range_check::validate(c, has_point)?;
            }
            None if !has_point => return Err(range_check::POINT_CANNOT_CLEAR.to_string()),
            None => {}
        }
    }
    let before = repo.get_checkin(&checkin_id).map_err(|e| e.to_string())?;
    repo.update_checkin(
        &checkin_id,
        &call_sign,
        name.as_deref(),
        qth_location.as_deref(),
        grid_square.as_deref(),
        address.as_deref(),
        location_lat,
        location_lon,
        location_label.as_deref(),
        has_traffic,
        traffic.as_deref(),
        contact.as_ref(),
    )
    .map_err(|e| e.to_string())?;
    if let Some(at) = &checked_in_at {
        repo.set_checkin_time(&checkin_id, at).map_err(|e| e.to_string())?;
    }
    // How the point was arrived at, when the location was placed again;
    // nothing when it isn't on the map any more.
    if let Some(how) = &location_how {
        let how = if location_lat.is_some() { how.as_str() } else { "" };
        repo.set_checkin_location_how(&checkin_id, how).map_err(|e| e.to_string())?;
    } else if before.location_how == "not_found"
        && (before.address != address.clone().unwrap_or_default()
            || before.qth_location != qth_location.clone().unwrap_or_default())
    {
        // "Couldn't be placed" was about the old text (LOCRES-065).
        repo.set_checkin_location_how(&checkin_id, "").map_err(|e| e.to_string())?;
    }
    let after = repo.get_checkin(&checkin_id).map_err(|e| e.to_string())?;
    let data = serde_json::json!({
        "before": {
            "call_sign": before.call_sign,
            "name": before.name,
            "qth_location": before.qth_location,
            "grid_square": before.grid_square,
            "address": before.address,
            "location_lat": before.location_lat,
            "location_lon": before.location_lon,
            "has_traffic": before.has_traffic,
            "traffic": before.traffic,
            "contact": contact_fields(&before),
        },
        "after": {
            "call_sign": call_sign,
            "name": name,
            "qth_location": qth_location,
            "grid_square": grid_square,
            "address": address,
            "location_lat": location_lat,
            "location_lon": location_lon,
            "has_traffic": has_traffic,
            "traffic": traffic,
            "contact": contact_fields(&after),
        },
    })
    .to_string();
    repo.create_audit_event(
        "checkin",
        &checkin_id,
        "correct",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn void_checkin(
    state: State<AppState>,
    checkin_id: String,
    reason: Option<String>,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_checkin_open(&repo, &checkin_id)?;
    repo.void_checkin(&checkin_id, reason.as_deref())
        .map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "reason": reason }).to_string();
    repo.create_audit_event(
        "checkin",
        &checkin_id,
        "void",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_checkin(
    state: State<AppState>,
    checkin_id: String,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    ensure_checkin_open(&repo, &checkin_id)?;
    repo.restore_checkin(&checkin_id)
        .map_err(|e| e.to_string())?;
    repo.create_audit_event(
        "checkin",
        &checkin_id,
        "restore",
        None,
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sets a check-in's location directly from known coordinates — a map click
/// or manually typed GPS coordinates — overriding whatever was auto-resolved
/// from its qth_location/grid_square/address. Mirrors
/// `set_operator_location_coords`/`set_activity_location_coords` (CIMAP-073).
#[tauri::command]
pub fn set_checkin_location_coords(
    state: State<AppState>,
    checkin_id: String,
    lat: f64,
    lon: f64,
    label: Option<String>,
    how: Option<String>,
) -> Result<Checkin, String> {
    let repo = state.repo.lock().unwrap();
    repo.set_checkin_location_coords(&checkin_id, lat, lon, label.as_deref())
        .map_err(|e| e.to_string())?;
    // Placed by hand: a pin, unless it says otherwise (typed coordinates, a
    // mile marker, a saved place; LOCRES-064).
    if let Some(how) = how {
        repo.set_checkin_location_how(&checkin_id, &how).map_err(|e| e.to_string())?;
    }
    repo.get_checkin(&checkin_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_checkin_location(
    state: State<AppState>,
    checkin_id: String,
) -> Result<Checkin, String> {
    let repo = state.repo.lock().unwrap();
    if checkin_activity_type(&repo, &checkin_id).is_some_and(|t| range_check::is_range_check(&t)) {
        return Err(range_check::POINT_CANNOT_CLEAR.to_string());
    }
    repo.clear_checkin_location(&checkin_id)
        .map_err(|e| e.to_string())?;
    repo.get_checkin(&checkin_id).map_err(|e| e.to_string())
}

/// Marks a check-in's traffic as dealt with (or not).
#[tauri::command]
pub fn set_checkin_traffic_handled(
    state: State<AppState>,
    checkin_id: String,
    handled: bool,
    operator_id: Option<String>,
) -> Result<(), String> {
    let repo = state.repo.lock().unwrap();
    repo.set_checkin_traffic_handled(&checkin_id, handled)
        .map_err(|e| e.to_string())?;
    let data = serde_json::json!({ "handled": handled }).to_string();
    repo.create_audit_event(
        "checkin",
        &checkin_id,
        "traffic_handled",
        Some(&data),
        operator_id.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// A check-in's contact details, for the before/after of a correction.
fn contact_fields(c: &Checkin) -> serde_json::Value {
    serde_json::json!({
        "at": c.checked_in_at,
        "frequency": c.frequency,
        "mode": c.mode,
        "rst_sent": c.rst_sent,
        "rst_received": c.rst_received,
        "power": c.power,
        "antenna": c.antenna,
        "notes": c.notes,
        "station_kind": c.station_kind,
        "cross_street": c.cross_street,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contact_time_is_checked_and_stored_as_utc() {
        let c = |at: &str| ContactDetails { contacted_at: Some(at.into()), ..Default::default() };
        let n = normalize_contact(Some(c("2026-09-14T10:05:00-04:00"))).unwrap().unwrap();
        assert_eq!(n.contacted_at.as_deref(), Some("2026-09-14T14:05:00+00:00"));
        assert!(normalize_contact(Some(c("yesterday"))).unwrap_err().contains("isn't a valid"));
        // Blank means "not given".
        assert_eq!(normalize_contact(Some(c("  "))).unwrap().unwrap().contacted_at, None);
        assert_eq!(normalize_contact(None).unwrap(), None);
        // A net check-in's corrected time is checked the same way.
        assert_eq!(
            normalize_time(Some("2026-09-14T10:05:00-04:00"), "check-in").unwrap().as_deref(),
            Some("2026-09-14T14:05:00+00:00")
        );
        assert!(normalize_time(Some("noon"), "check-in").unwrap_err().contains("check-in time"));
    }
}
