use super::{AppState, ERR_OFFLINE};
use crate::geocode::{self, Found, Lookup};
use tauri::{AppHandle, Manager, State};

fn near(lat: Option<f64>, lon: Option<f64>) -> Option<(f64, f64)> {
    lat.zip(lon)
}

/// Looks typed text up online (LOCRES-051–LOCRES-053): an address, a town, or a cross
/// street, near `near` (the net) when given. Shorthand like "sw 152 st" is
/// understood, and each place is asked once (geocode.rs). Used where the
/// operator waits for the answer, such as the map picker's search.
#[tauri::command]
pub async fn geocode_location(
    state: State<'_, AppState>,
    query: String,
    near_lat: Option<f64>,
    near_lon: Option<f64>,
) -> Result<Option<Found>, String> {
    let dir = state.datapacks_dir.clone();
    match geocode::find(&state.place_cache, &dir, &query, near(near_lat, near_lon)).await {
        Lookup::Found(f) => Ok(Some(f)),
        Lookup::NotFound => Ok(None),
        Lookup::Offline => Err(ERR_OFFLINE.to_string()),
        Lookup::Error(e) => Err(e),
    }
}

/// A place already looked up, from memory only: no network, so it answers
/// offline (LOCRES-055). For the shared place resolver (placeText.ts).
#[tauri::command]
pub fn recall_place(
    state: State<'_, AppState>,
    text: String,
    near_lat: Option<f64>,
    near_lon: Option<f64>,
) -> Option<Found> {
    geocode::recall(&state.place_cache, &text, near(near_lat, near_lon))
}

/// The map popup's words for a place found online: the typed text, and how
/// rough it is when it isn't an exact address or corner.
fn label_for(text: &str, f: &Found) -> String {
    let rough = match f.precision {
        geocode::Precision::Street => Some("somewhere along the street"),
        geocode::Precision::Town => Some("the town's centre"),
        geocode::Precision::Region => Some("the area's centre"),
        geocode::Precision::Address | geocode::Precision::Crossing => None,
    };
    match rough {
        Some(r) => format!("{} ({r} — approximate)", text.trim()),
        None => text.trim().to_string(),
    }
}

/// Looks up a saved check-in's typed location in the background and puts it
/// on the map when found (LOCRES-050), so saving never waits on the internet.
/// Left alone if it was placed by hand or its location changed meanwhile.
/// `replace_grid`: the grid square came from the old point, not a call-sign
/// lookup, so it follows the new one. `exact_only`: it's already at QRZ's
/// point, so only a matched house or corner moves it (LOCRES-062).
#[tauri::command]
pub fn place_checkin_later(
    app: AppHandle,
    checkin_id: String,
    text: String,
    near_lat: Option<f64>,
    near_lon: Option<f64>,
    replace_grid: bool,
    exact_only: Option<bool>,
) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let dir = state.datapacks_dir.clone();
        let Lookup::Found(f) = geocode::find(&state.place_cache, &dir, &text, near(near_lat, near_lon)).await else {
            return;
        };
        let exact = matches!(f.precision, geocode::Precision::Address | geocode::Precision::Crossing);
        if exact_only.unwrap_or(false) && !exact {
            return;
        }
        let grid = replace_grid.then(|| geocode::grid_square(f.lat, f.lon));
        let placed = state
            .repo
            .lock()
            .unwrap()
            .place_checkin(&checkin_id, &text, f.lat, f.lon, &label_for(&text, &f), grid.as_deref());
        if let Ok(Some(activity_id)) = placed {
            let _ = tauri::Emitter::emit(&app, "location-placed", &activity_id);
        }
    });
}

/// The same for a spotter report's Location box (LOCRES-050).
#[tauri::command]
pub fn place_report_later(
    app: AppHandle,
    report_id: String,
    text: String,
    near_lat: Option<f64>,
    near_lon: Option<f64>,
) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let dir = state.datapacks_dir.clone();
        let Lookup::Found(f) = geocode::find(&state.place_cache, &dir, &text, near(near_lat, near_lon)).await else {
            return;
        };
        let placed = state.repo.lock().unwrap().place_report(&report_id, &text, f.lat, f.lon);
        if let Ok(Some(activity_id)) = placed {
            let _ = tauri::Emitter::emit(&app, "location-placed", &activity_id);
        }
    });
}
