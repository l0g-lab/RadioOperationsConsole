use super::ERR_OFFLINE;
use crate::connectors;

/// Resolves free-text location into coordinates via the public OSM
/// Nominatim geocoder (CIMAP-011), used as a fallback when a check-in has
/// no grid square. Requires no configuration (CIMAP-040).
#[tauri::command]
pub async fn geocode_location(query: String) -> Result<Option<connectors::GeocodeResult>, String> {
    match connectors::geocode_location(&query).await {
        connectors::GeocodeOutcome::Found(r) => Ok(Some(r)),
        connectors::GeocodeOutcome::NotFound => Ok(None),
        connectors::GeocodeOutcome::Offline => Err(ERR_OFFLINE.to_string()),
        connectors::GeocodeOutcome::Error(e) => Err(e),
    }
}
