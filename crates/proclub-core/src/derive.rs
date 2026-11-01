use crate::session::session_day_rome;
use serde_json::{json, Value};
use std::collections::BTreeMap;

const SUMMARY_MATCHES: usize = 30;

pub fn as_f64(v: Option<&Value>) -> f64 {
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

pub fn as_i64(v: Option<&Value>) -> i64 {
    as_f64(v) as i64
}

pub fn match_id_of(m: &Value) -> Option<String> {
    match m.get("matchId") {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

pub fn is_complete_match(m: &Value, club_id: &str) -> bool {
    match_id_of(m).is_some()
        && m.get("clubs")
            .and_then(|c| c.get(club_id))
            .map(|c| c.is_object())
            .unwrap_or(false)
}

/// Storico completo del club ordinato dalla partita più recente alla più vecchia, senza duplicati.
pub fn history_of(data: &Value, club_id: &str) -> Vec<Value> {
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    if let Some(arr) = data.get("matches").and_then(|v| v.as_array()) {
        for m in arr {
            if is_complete_match(m, club_id) {
                if let Some(id) = match_id_of(m) {
                    by_id.insert(id, m.clone());
                }
            }
        }
    }
    // `matchHistory` vince sui doppioni (record completi dello storico).
    if let Some(arr) = data.get("matchHistory").and_then(|v| v.as_array()) {
        for m in arr {
            if is_complete_match(m, club_id) {
                if let Some(id) = match_id_of(m) {
                    by_id.insert(id, m.clone());
                }
            }
        }
    }
    let mut out: Vec<Value> = by_id.into_values().collect();
    out.sort_by(|a, b| {
        let tb = as_i64(b.get("timestamp"));
        let ta = as_i64(a.get("timestamp"));
        tb.cmp(&ta).then_with(|| {
            let ida = match_id_of(a).unwrap_or_default();
            let idb = match_id_of(b).unwrap_or_default();
            ida.cmp(&idb)
        })
    });
    out
}

pub fn nights_of(history: &[Value], night_ends_at_hour: u32) -> Vec<Value> {
    struct NightAcc {
        games: usize,
        from: i64,
        to: i64,
    }
    let mut map: BTreeMap<String, NightAcc> = BTreeMap::new();
    for m in history {
        let ts = as_i64(m.get("timestamp"));
        let day = session_day_rome(ts, night_ends_at_hour);
        let entry = map.entry(day).or_insert(NightAcc {
            games: 0,
            from: i64::MAX,
            to: i64::MIN,
        });
        entry.games += 1;
        if ts < entry.from {
            entry.from = ts;
        }
        if ts > entry.to {
            entry.to = ts;
        }
    }
    let mut nights: Vec<(String, NightAcc)> = map.into_iter().collect();
    nights.sort_by(|(a, _), (b, _)| b.cmp(a));
    nights
        .into_iter()
        .map(|(day, acc)| {
            json!({
                "day": day,
                "games": acc.games,
                "from": acc.from,
                "to": acc.to,
            })
        })
        .collect()
}

pub fn summary_from(data: &Value, club_id: &str) -> Value {
    let history = history_of(data, club_id);
    let recent: Vec<Value> = data
        .get("matches")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|m| is_complete_match(m, club_id))
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    let matches_slice: Vec<Value> = if !recent.is_empty() {
        recent.into_iter().take(SUMMARY_MATCHES).collect()
    } else {
        history.iter().take(SUMMARY_MATCHES).cloned().collect()
    };
    let season = data
        .get("season")
        .filter(|s| !s.is_null())
        .cloned()
        .or_else(|| {
            data.get("collectionStatus")
                .and_then(|cs| cs.get("startedAt"))
                .filter(|s| s.is_string())
                .map(|started| json!({ "startedAt": started }))
        })
        .unwrap_or(Value::Null);

    json!({
        "version": 2,
        "capturedAt": data.get("capturedAt").cloned().unwrap_or(Value::Null),
        "club": data.get("club").cloned().unwrap_or_else(|| json!([])),
        "members": data.get("members").cloned().unwrap_or_else(|| json!({ "members": [] })),
        "matches": matches_slice,
        "nights": nights_of(&history, 6),
        "matchCount": history.len(),
        "season": season,
    })
}

pub fn night_from(data: &Value, day: &str, club_id: &str) -> Option<Value> {
    let mut matches: Vec<Value> = history_of(data, club_id)
        .into_iter()
        .filter(|m| session_day_rome(as_i64(m.get("timestamp")), 6) == day)
        .collect();
    if matches.is_empty() {
        return None;
    }
    matches.sort_by(|a, b| as_i64(a.get("timestamp")).cmp(&as_i64(b.get("timestamp"))));
    Some(json!({
        "day": day,
        "matches": matches,
    }))
}

pub fn history_from(data: &Value, club_id: &str) -> Value {
    json!({
        "version": 1,
        "matchHistory": history_of(data, club_id),
    })
}

pub fn health_from(data: &Value) -> Value {
    let cs = data.get("collectionStatus");
    let checked_at = cs
        .and_then(|c| c.get("checkedAt"))
        .or_else(|| data.get("capturedAt"))
        .cloned()
        .unwrap_or(Value::Null);
    let captured_at = data.get("capturedAt").cloned().unwrap_or(Value::Null);
    let complete = cs
        .and_then(|c| c.get("complete"))
        .and_then(|v| v.as_bool())
        .map(|b| b)
        .unwrap_or(true);
    let failures = cs
        .and_then(|c| c.get("endpointFailures"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let stale = cs
        .and_then(|c| c.get("stale"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let lost = cs
        .and_then(|c| c.get("lostClubMatches"))
        .map(|v| as_i64(Some(v)))
        .unwrap_or(0);
    let written_off = cs
        .and_then(|c| c.get("writtenOff"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    let season = data
        .get("season")
        .filter(|s| !s.is_null())
        .cloned()
        .or_else(|| {
            cs.and_then(|c| c.get("startedAt"))
                .filter(|s| s.is_string())
                .map(|started| json!({ "startedAt": started }))
        })
        .unwrap_or(Value::Null);

    json!({
        "version": 1,
        "checkedAt": checked_at,
        "capturedAt": captured_at,
        "complete": complete,
        "failures": failures,
        "stale": stale,
        "lostClubMatches": lost,
        "writtenOff": written_off,
        "season": season,
        "consecutiveFailures": 0,
        "engine": { "ok": true },
    })
}
