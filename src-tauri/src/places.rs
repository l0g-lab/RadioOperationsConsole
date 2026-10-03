//! Saved places (docs/features/saved-places.md): spots net control often
//! operates from, picked in the map instead of found again each time. Only a
//! starting point: an activity keeps its own copy of the location.

use crate::repo::Repository;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Place {
    pub id: String,
    #[serde(flatten)]
    pub details: PlaceDetails,
}

/// What the operator enters for a place.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct PlaceDetails {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub notes: String,
}

/// Checks and tidies what was entered (PLACE-001).
pub fn clean(mut d: PlaceDetails) -> Result<PlaceDetails, String> {
    d.name = d.name.trim().to_string();
    d.notes = d.notes.trim().to_string();
    if d.name.is_empty() {
        return Err("A place needs a name.".into());
    }
    let on_earth = (-90.0..=90.0).contains(&d.lat) && (-180.0..=180.0).contains(&d.lon);
    if !on_earth {
        return Err("A place needs a point on the map.".into());
    }
    Ok(d)
}

fn map(r: &rusqlite::Row) -> rusqlite::Result<Place> {
    Ok(Place {
        id: r.get(0)?,
        details: PlaceDetails {
            name: r.get(1)?,
            lat: r.get(2)?,
            lon: r.get(3)?,
            notes: r.get(4)?,
        },
    })
}

const COLS: &str = "id, name, lat, lon, coalesce(notes,'')";

impl Repository {
    /// Saved places by name (PLACE-010).
    pub fn list_places(&self) -> rusqlite::Result<Vec<Place>> {
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT {COLS} FROM places ORDER BY name COLLATE NOCASE"))?;
        let rows = stmt.query_map([], map)?;
        rows.collect()
    }

    pub fn get_place(&self, id: &str) -> rusqlite::Result<Place> {
        self.conn.query_row(&format!("SELECT {COLS} FROM places WHERE id = ?1"), params![id], map)
    }

    /// Adds a place (already checked with `clean`).
    pub fn create_place(&self, d: &PlaceDetails) -> rusqlite::Result<String> {
        let id = Uuid::new_v4().to_string();
        let notes = (!d.notes.is_empty()).then_some(d.notes.as_str());
        self.conn.execute(
            "INSERT INTO places(id, name, lat, lon, notes, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![id, d.name, d.lat, d.lon, notes, Utc::now().to_rfc3339()],
        )?;
        Ok(id)
    }

    /// Replaces a place's details. Activities set from it keep their own copy.
    pub fn update_place(&self, id: &str, d: &PlaceDetails) -> rusqlite::Result<()> {
        let notes = (!d.notes.is_empty()).then_some(d.notes.as_str());
        let n = self.conn.execute(
            "UPDATE places SET name = ?1, lat = ?2, lon = ?3, notes = ?4 WHERE id = ?5",
            params![d.name, d.lat, d.lon, notes, id],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    /// Deletes a place. Nothing else refers to it, so nothing else changes.
    pub fn delete_place(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM places WHERE id = ?1", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> Repository {
        let path = std::env::temp_dir().join(format!("roc-place-{}.db", Uuid::new_v4()));
        Repository::new(crate::db::open_db(&path).unwrap())
    }

    fn club() -> PlaceDetails {
        PlaceDetails { name: " Club HQ ".into(), lat: 28.54, lon: -81.38, notes: " Generator on site ".into() }
    }

    #[test]
    fn places_need_a_name_and_a_real_point() {
        let d = clean(club()).unwrap();
        assert_eq!((d.name.as_str(), d.notes.as_str()), ("Club HQ", "Generator on site"));
        assert!(clean(PlaceDetails { name: " ".into(), ..club() }).unwrap_err().contains("name"));
        assert!(clean(PlaceDetails { lat: 91.0, ..club() }).unwrap_err().contains("point"));
        assert!(clean(PlaceDetails { lon: f64::NAN, ..club() }).unwrap_err().contains("point"));
    }

    #[test]
    fn places_are_listed_by_name_edited_and_deleted() {
        let r = repo();
        let club_id = r.create_place(&clean(club()).unwrap()).unwrap();
        r.create_place(&clean(PlaceDetails { name: "Bob's QTH".into(), notes: String::new(), ..club() }).unwrap())
            .unwrap();
        let names = |r: &Repository| r.list_places().unwrap().into_iter().map(|p| p.details.name).collect::<Vec<_>>();
        assert_eq!(names(&r), ["Bob's QTH", "Club HQ"]);

        r.update_place(&club_id, &PlaceDetails { name: "Club HQ / EOC".into(), ..clean(club()).unwrap() })
            .unwrap();
        assert_eq!(r.get_place(&club_id).unwrap().details.name, "Club HQ / EOC");
        assert_eq!(r.get_place(&club_id).unwrap().details.notes, "Generator on site");
        assert!(r.update_place("missing", &clean(club()).unwrap()).is_err());

        r.delete_place(&club_id).unwrap();
        assert_eq!(names(&r), ["Bob's QTH"]);
    }
}
