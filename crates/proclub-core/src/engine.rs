use crate::derive::{as_f64, as_i64, is_complete_match, match_id_of};
use crate::session::{season_key, session_day_rome};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};

fn pos_abbrev(role: &str) -> &'static str {
    match role {
        "goalkeeper" => "POR",
        "defender" => "DIF",
        "midfielder" => "CEN",
        "forward" => "ATT",
        _ => "—",
    }
}

fn finite_num(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64().filter(|x| x.is_finite()),
        Some(Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                t.parse::<f64>().ok().filter(|x| x.is_finite())
            }
        }
        _ => None,
    }
}

/// Profilo difensivo e punteggio pesato G+A (identico a `defense.js`).
pub fn defense_profile(match_history: &[Value], member: &Value, club_id: &str) -> Value {
    let member_name = member.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let total = as_f64(member.get("goals")) + as_f64(member.get("assists"));
    let mut def_games = 0usize;
    let mut def_ga = 0.0f64;
    let mut base_games = 0usize;
    let mut base_ga = 0.0f64;

    for m in match_history {
        let Some(players) = m
            .get("players")
            .and_then(|p| p.get(club_id))
            .and_then(|c| c.as_object())
        else {
            continue;
        };
        let Some(row) = players
            .values()
            .find(|p| p.get("playername").and_then(|n| n.as_str()) == Some(member_name))
        else {
            continue;
        };
        let ga = as_f64(row.get("goals")) + as_f64(row.get("assists"));
        if row.get("pos").and_then(|v| v.as_str()) == Some("defender") {
            def_games += 1;
            def_ga += ga;
        } else {
            base_games += 1;
            base_ga += ga;
        }
    }

    let weighted = if def_games > 0 && base_games >= 5 {
        (total - def_ga + (def_games as f64) * (base_ga / (base_games as f64))).max(0.0)
    } else {
        total
    };
    let adjusted = (weighted - total).abs() > 1e-9;

    json!({
        "defGames": def_games,
        "defGA": def_ga,
        "baseGames": base_games,
        "total": total,
        "weighted": weighted,
        "adjusted": adjusted,
    })
}

/// Ordina la rosa per G+A pesato, poi G+A reale, gol, presenze e nome.
pub fn rank_members(members: &[Value], match_history: &[Value], club_id: &str) -> Vec<Value> {
    let mut enriched: Vec<Value> = members
        .iter()
        .map(|member| {
            let def = defense_profile(match_history, member, club_id);
            let mut obj = member.as_object().cloned().unwrap_or_default();
            obj.insert("defense".to_string(), def);
            Value::Object(obj)
        })
        .collect();

    enriched.sort_by(|a, b| {
        let wa = as_f64(a.get("defense").and_then(|d| d.get("weighted")));
        let wb = as_f64(b.get("defense").and_then(|d| d.get("weighted")));
        let ta = as_f64(a.get("defense").and_then(|d| d.get("total")));
        let tb = as_f64(b.get("defense").and_then(|d| d.get("total")));
        let ga = as_f64(a.get("goals"));
        let gb = as_f64(b.get("goals"));
        let gpa = as_f64(a.get("gamesPlayed"));
        let gpb = as_f64(b.get("gamesPlayed"));
        let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");

        wb.partial_cmp(&wa)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| tb.partial_cmp(&ta).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| gb.partial_cmp(&ga).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| gpb.partial_cmp(&gpa).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| na.to_lowercase().cmp(&nb.to_lowercase()))
    });

    enriched
}

/// Calcola il profilo figurina (`computeCardProfile`) per un Pro.
pub fn compute_card_profile(member: &Value, matches: &[Value], club_id: &str) -> Value {
    let name_lower = member
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();

    let mut sorted_matches: Vec<&Value> = matches.iter().collect();
    sorted_matches.sort_by(|a, b| as_i64(b.get("timestamp")).cmp(&as_i64(a.get("timestamp"))));

    let mut appearances: Vec<&Value> = Vec::new();
    for m in sorted_matches {
        if let Some(players) = m
            .get("players")
            .and_then(|p| p.get(club_id))
            .and_then(|c| c.as_object())
        {
            for app in players.values() {
                let pname = app
                    .get("playername")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                if pname == name_lower {
                    appearances.push(app);
                }
            }
        }
    }

    let role = appearances
        .first()
        .and_then(|a| a.get("pos").and_then(|v| v.as_str()))
        .or_else(|| member.get("favoritePosition").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();

    let role_apps: Vec<&Value> = appearances
        .into_iter()
        .filter(|a| a.get("pos").and_then(|v| v.as_str()).unwrap_or("") == role)
        .collect();

    let games = role_apps.len();
    let sum_field = |key: &str| -> f64 { role_apps.iter().map(|a| as_f64(a.get(key))).sum() };
    let goals = sum_field("goals");
    let assists = sum_field("assists");
    let shots = sum_field("shots");
    let passes = sum_field("passesmade");
    let pass_attempts = sum_field("passattempts");
    let tackles = sum_field("tacklesmade");
    let saves = sum_field("saves");
    let rating = if games > 0 {
        sum_field("rating") / (games as f64)
    } else {
        0.0
    };
    let pass_pct = if pass_attempts > 0.0 {
        ((passes / pass_attempts) * 100.0).round() as i64
    } else {
        0
    };
    let denom = (games.max(1)) as f64;
    let role_score = match role.as_str() {
        "forward" => ((goals + 0.7 * assists) / denom) * 9.0,
        "midfielder" => ((assists + 0.8 * goals) / denom) * 8.0,
        "defender" => (tackles / denom) * 2.5 + (assists / denom) * 4.0,
        _ => (saves / denom) * 2.5,
    };
    let form_score = if games > 0 {
        let missing_penalty = (5isize - (games as isize)).max(0) as f64 * 3.0;
        let raw = 50.0 + (rating - 6.0) * 10.0 + role_score.min(16.0) + (pass_pct as f64) * 0.08
            - missing_penalty;
        raw.clamp(40.0, 99.0).round() as i64
    } else {
        0
    };

    let season_games = as_f64(member.get("gamesPlayed")) as usize;
    let basis = if games > 0 {
        "recent"
    } else if season_games > 0 {
        "season"
    } else {
        "none"
    };

    let s_denom = (season_games.max(1)) as f64;
    let season_base =
        ((as_f64(member.get("goals")) + 0.7 * as_f64(member.get("assists"))) / s_denom) * 8.0;
    let s_penalty = (5isize - (season_games as isize)).max(0) as f64 * 3.0;
    let season_raw = 50.0
        + (as_f64(member.get("ratingAve")) - 6.0) * 10.0
        + season_base.min(16.0)
        + as_f64(member.get("passSuccessRate")) * 0.08
        - s_penalty;
    let score = if basis == "season" {
        season_raw.clamp(40.0, 99.0).round() as i64
    } else {
        form_score
    };

    let tier = if basis == "none" {
        "unranked"
    } else if score >= 92 {
        "iridescent"
    } else if score >= 87 {
        "platinum"
    } else if score >= 78 {
        "gold"
    } else if score >= 70 {
        "silver"
    } else {
        "bronze"
    };

    let recent_apps: Vec<&Value> = role_apps.iter().take(3).copied().collect();
    let recent_rating = if !recent_apps.is_empty() {
        recent_apps
            .iter()
            .map(|a| as_f64(a.get("rating")))
            .sum::<f64>()
            / (recent_apps.len() as f64)
    } else {
        0.0
    };
    let recent_contrib: i64 = recent_apps
        .iter()
        .map(|a| as_i64(a.get("goals")) + as_i64(a.get("assists")))
        .sum();
    let hot = recent_apps.len() == 3 && recent_rating >= 7.8 && recent_contrib >= 4;

    json!({
        "role": role,
        "label": pos_abbrev(&role),
        "games": games,
        "goals": goals as i64,
        "assists": assists as i64,
        "shots": shots as i64,
        "passes": passes as i64,
        "passAttempts": pass_attempts as i64,
        "tackles": tackles as i64,
        "saves": saves as i64,
        "rating": rating,
        "passPct": pass_pct,
        "tier": tier,
        "score": score,
        "basis": basis,
        "hot": hot,
        "recentRating": recent_rating,
        "recentContrib": recent_contrib,
    })
}

/// Raggruppa le gare per serata (`YYYY-MM-DD`, ora italiana con taglio alle 06:00).
pub fn group_by_night(matches: &[Value], club_id: &str) -> Vec<Value> {
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    for m in matches {
        if is_complete_match(m, club_id) {
            if let Some(id) = match_id_of(m) {
                by_id.insert(id, m.clone());
            }
        }
    }
    let mut nights: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for m in by_id.into_values() {
        let day = session_day_rome(as_i64(m.get("timestamp")), 6);
        nights.entry(day).or_default().push(m);
    }
    let mut entries: Vec<(String, Vec<Value>)> = nights.into_iter().collect();
    entries.sort_by(|(a, _), (b, _)| b.cmp(a));
    entries
        .into_iter()
        .map(|(day, mut games)| {
            games.sort_by(|a, b| as_i64(a.get("timestamp")).cmp(&as_i64(b.get("timestamp"))));
            json!({ "day": day, "games": games })
        })
        .collect()
}

/// Sintetizza una serata o insieme di gare (`summarizeNight`).
pub fn summarize_night(matches: &[Value], club_id: &str) -> Value {
    struct PlayerRec {
        id: String,
        name: String,
        apps: Vec<Value>,
    }
    let mut order: Vec<String> = Vec::new();
    let mut by_player: HashMap<String, PlayerRec> = HashMap::new();

    for m in matches {
        if let Some(p_map) = m
            .get("players")
            .and_then(|p| p.get(club_id))
            .and_then(|c| c.as_object())
        {
            for (pid, app) in p_map {
                if app.is_null() || !app.is_object() {
                    continue;
                }
                let pname = app
                    .get("playername")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let entry = by_player.entry(pid.clone()).or_insert_with(|| {
                    order.push(pid.clone());
                    PlayerRec {
                        id: pid.clone(),
                        name: pname.clone(),
                        apps: Vec::new(),
                    }
                });
                entry.name = pname;
                entry.apps.push(app.clone());
            }
        }
    }

    let mut players: Vec<Value> = order
        .into_iter()
        .filter_map(|pid| by_player.remove(&pid))
        .map(|rec| {
            let sum_i = |k: &str| -> i64 { rec.apps.iter().map(|a| as_i64(a.get(k))).sum() };
            let rated_apps: Vec<f64> = rec
                .apps
                .iter()
                .filter_map(|a| finite_num(a.get("rating")).filter(|&r| r > 0.0))
                .collect();
            let rating = if !rated_apps.is_empty() {
                Some(rated_apps.iter().sum::<f64>() / (rated_apps.len() as f64))
            } else {
                None
            };
            let goals = sum_i("goals");
            let assists = sum_i("assists");
            let shots = sum_i("shots");
            let passes = sum_i("passesmade");
            let pass_attempts = sum_i("passattempts");
            let tackles = sum_i("tacklesmade");
            let tackle_attempts = sum_i("tackleattempts");
            let saves = sum_i("saves");
            let reds = sum_i("redcards");
            let mvp = sum_i("mom");
            let mut roles: Vec<String> = Vec::new();
            let mut role_counts = Map::new();
            for a in &rec.apps {
                let pos = a
                    .get("pos")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if !roles.contains(&pos) {
                    roles.push(pos.clone());
                }
                let prev = role_counts
                    .get(&pos)
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                role_counts.insert(pos, json!(prev + 1));
            }
            let pass_pct = if pass_attempts > 0 {
                Some((((passes as f64) / (pass_attempts as f64)) * 100.0).round() as i64)
            } else {
                None
            };
            json!({
                "id": rec.id,
                "name": rec.name,
                "appearances": rec.apps,
                "games": rec.apps.len(),
                "rating": rating,
                "ratedGames": rated_apps.len(),
                "goals": goals,
                "assists": assists,
                "shots": shots,
                "passes": passes,
                "passAttempts": pass_attempts,
                "tackles": tackles,
                "tackleAttempts": tackle_attempts,
                "saves": saves,
                "reds": reds,
                "mvp": mvp,
                "roles": roles,
                "roleCounts": Value::Object(role_counts),
                "passPct": pass_pct,
            })
        })
        .collect();

    players.sort_by(|a, b| {
        let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        na.to_lowercase()
            .cmp(&nb.to_lowercase())
            .then_with(|| na.cmp(nb))
    });

    let required = (matches.len() + 1) / 2;
    let mut qualified: Vec<Value> = players
        .iter()
        .filter(|p| {
            let g = as_i64(p.get("games")) as usize;
            let rg = as_i64(p.get("ratedGames")) as usize;
            g >= required && rg == g
        })
        .cloned()
        .collect();
    let mut fallback = false;
    if qualified.is_empty() {
        fallback = true;
        let rated: Vec<&Value> = players
            .iter()
            .filter(|p| {
                let g = as_i64(p.get("games"));
                let rg = as_i64(p.get("ratedGames"));
                rg == g && p.get("rating").map(|r| !r.is_null()).unwrap_or(false)
            })
            .collect();
        let max_games = rated
            .iter()
            .map(|p| as_i64(p.get("games")))
            .max()
            .unwrap_or(0);
        qualified = rated
            .into_iter()
            .filter(|p| as_i64(p.get("games")) == max_games)
            .cloned()
            .collect();
    }
    let best_rating = qualified
        .iter()
        .filter_map(|p| p.get("rating").and_then(|r| r.as_f64()))
        .fold(-1.0f64, f64::max);
    let winners: Vec<Value> = qualified
        .into_iter()
        .filter(|p| {
            let r = p.get("rating").and_then(|v| v.as_f64()).unwrap_or(-1.0);
            (r - best_rating).abs() < 1e-6
        })
        .collect();

    let mut wins = 0i64;
    let mut draws = 0i64;
    let mut losses = 0i64;
    let mut goals = 0i64;
    let mut against = 0i64;
    for m in matches {
        if let Some(own) = m.get("clubs").and_then(|c| c.get(club_id)) {
            let gf = as_i64(own.get("goals"));
            let ga = as_i64(own.get("goalsAgainst"));
            goals += gf;
            against += ga;
            if gf > ga {
                wins += 1;
            } else if gf < ga {
                losses += 1;
            } else {
                draws += 1;
            }
        }
    }

    json!({
        "players": players,
        "winners": winners,
        "required": required,
        "fallback": fallback,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "goals": goals,
        "against": against,
    })
}

/// Costruisce la tabella voti (`buildGradeRows`: stagione, ultima serata, ultime 15 gare).
pub fn build_grade_rows(members: &[Value], matches: &[Value], club_id: &str) -> Value {
    let mut unique_map: BTreeMap<String, Value> = BTreeMap::new();
    for m in matches {
        if let Some(id) = match_id_of(m) {
            if is_complete_match(m, club_id) {
                unique_map.insert(id, m.clone());
            }
        }
    }
    let mut unique: Vec<Value> = unique_map.into_values().collect();
    unique.sort_by(|a, b| as_i64(b.get("timestamp")).cmp(&as_i64(a.get("timestamp"))));

    let recent_matches: Vec<Value> = unique.iter().take(15).cloned().collect();
    let nights = group_by_night(&unique, club_id);
    let latest_night = nights.first();
    let latest_games: Vec<Value> = latest_night
        .and_then(|n| n.get("games"))
        .and_then(|g| g.as_array())
        .cloned()
        .unwrap_or_default();

    let recent_summary = summarize_night(&recent_matches, club_id);
    let night_summary = summarize_night(&latest_games, club_id);
    let recent_players = recent_summary
        .get("players")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let night_players = night_summary
        .get("players")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut names: Vec<String> = Vec::new();
    let mut seen_lower: BTreeSet<String> = BTreeSet::new();
    for name in members
        .iter()
        .filter_map(|m| m.get("name").and_then(|v| v.as_str()))
        .chain(
            recent_players
                .iter()
                .filter_map(|p| p.get("name").and_then(|v| v.as_str())),
        )
    {
        let low = name.to_lowercase();
        if seen_lower.insert(low) {
            names.push(name.to_string());
        }
    }

    let mut rows: Vec<Value> = names
        .into_iter()
        .map(|name| {
            let low = name.to_lowercase();
            let season_row = members.iter().find(|m| {
                m.get("name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_lowercase() == low)
                    .unwrap_or(false)
            });
            let recent_row = recent_players.iter().find(|p| {
                p.get("name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_lowercase() == low)
                    .unwrap_or(false)
            });
            let evening_row = night_players.iter().find(|p| {
                p.get("name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_lowercase() == low)
                    .unwrap_or(false)
            });

            let s_games = season_row.map(|r| as_i64(r.get("gamesPlayed"))).unwrap_or(0);
            let s_rating_raw = season_row.map(|r| as_f64(r.get("ratingAve"))).unwrap_or(0.0);
            let season_val = if s_games > 0 && s_rating_raw > 0.0 {
                json!(s_rating_raw)
            } else {
                Value::Null
            };

            json!({
                "name": name,
                "season": season_val,
                "seasonGames": s_games,
                "recent": recent_row.and_then(|r| r.get("rating")).cloned().unwrap_or(Value::Null),
                "recentGames": recent_row.map(|r| as_i64(r.get("ratedGames"))).unwrap_or(0),
                "evening": evening_row.and_then(|r| r.get("rating")).cloned().unwrap_or(Value::Null),
                "eveningGames": evening_row.map(|r| as_i64(r.get("ratedGames"))).unwrap_or(0),
                "session": evening_row.cloned().unwrap_or(Value::Null),
            })
        })
        .collect();

    rows.sort_by(|a, b| {
        let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        na.to_lowercase().cmp(&nb.to_lowercase())
    });

    json!({
        "windowSize": recent_matches.len(),
        "nightGames": latest_games.len(),
        "nightDate": latest_night.and_then(|n| n.get("day")).cloned().unwrap_or(Value::Null),
        "rows": rows,
    })
}

/// Unisce e ordina lo storico partite senza perdere campi già salvati (usato dal collector EA in Rust).
pub fn merge_value(old: &Value, incoming: &Value) -> Value {
    match (old, incoming) {
        (Value::Object(o), Value::Object(inc)) => {
            let mut result = o.clone();
            for (k, v) in inc {
                if v.is_null() || v.as_str() == Some("") {
                    continue;
                }
                let next = if v.is_object() {
                    merge_value(o.get(k).unwrap_or(&Value::Null), v)
                } else {
                    v.clone()
                };
                result.insert(k.clone(), next);
            }
            Value::Object(result)
        }
        (_, inc) => inc.clone(),
    }
}

pub fn merge_history(history: &[Value], incoming: &[Value]) -> (Vec<Value>, Vec<Value>) {
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    for m in history {
        if let Some(id) = match_id_of(m) {
            let prev = by_id.remove(&id).unwrap_or_else(|| json!({}));
            by_id.insert(id, merge_value(&prev, m));
        }
    }
    let old_ids: BTreeSet<String> = by_id.keys().cloned().collect();
    for m in incoming {
        if let Some(id) = match_id_of(m) {
            let prev = by_id.remove(&id).unwrap_or_else(|| json!({}));
            by_id.insert(id, merge_value(&prev, m));
        }
    }
    let mut merged: Vec<Value> = by_id.into_values().collect();
    merged.sort_by(|a, b| as_i64(b.get("timestamp")).cmp(&as_i64(a.get("timestamp"))));
    let fresh: Vec<Value> = merged
        .iter()
        .filter(|m| {
            match_id_of(m)
                .map(|id| !old_ids.contains(&id))
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    (merged, fresh)
}

pub fn fill_missing(existing: &Value, incoming: &Value) -> Value {
    if existing.is_null() || existing.as_str() == Some("") {
        return incoming.clone();
    }
    if let (Value::Object(ex), Value::Object(inc)) = (existing, incoming) {
        let mut out = ex.clone();
        for (k, v) in inc {
            let cur = ex.get(k).unwrap_or(&Value::Null);
            out.insert(k.clone(), fill_missing(cur, v));
        }
        return Value::Object(out);
    }
    existing.clone()
}

/// Aggiorna l'indice `archive/index.json` di un club.
pub fn build_archive_index(existing: &[Value], history: &[Value], club_id: &str) -> Vec<Value> {
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    for e in existing {
        if let Some(id) = match_id_of(e) {
            by_id.insert(id, e.clone());
        }
    }
    for m in history {
        let Some(id) = match_id_of(m) else {
            continue;
        };
        let clubs = m.get("clubs").and_then(|c| c.as_object());
        let own = clubs.and_then(|c| c.get(club_id));
        let opp_name = clubs
            .and_then(|c| c.iter().find(|(cid, _)| cid.as_str() != club_id))
            .and_then(|(_, v)| v.get("details"))
            .and_then(|d| d.get("name"))
            .and_then(|n| n.as_str())
            .map(|s| Value::String(s.to_string()))
            .unwrap_or(Value::Null);
        let ts = as_i64(m.get("timestamp"));
        let gf = as_i64(own.and_then(|o| o.get("goals")));
        let ga = as_i64(own.and_then(|o| o.get("goalsAgainst")));
        let result = own
            .and_then(|o| o.get("result"))
            .map(|r| match r {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                _ => String::new(),
            })
            .unwrap_or_default();
        by_id.insert(
            id.clone(),
            json!({
                "matchId": id,
                "timestamp": ts,
                "month": season_key(ts),
                "opponent": opp_name,
                "goalsFor": gf,
                "goalsAgainst": ga,
                "result": result,
            }),
        );
    }
    let mut index: Vec<Value> = by_id.into_values().collect();
    index.sort_by(|a, b| {
        let tb = as_i64(b.get("timestamp"));
        let ta = as_i64(a.get("timestamp"));
        tb.cmp(&ta).then_with(|| {
            let ida = match_id_of(a).unwrap_or_default();
            let idb = match_id_of(b).unwrap_or_default();
            ida.cmp(&idb)
        })
    });
    index
}

pub fn validate_ea_club(club: &Value, club_id: &str) -> Result<(), String> {
    let Some(arr) = club.as_array() else {
        return Err("Statistiche club non valide".into());
    };
    let Some(first) = arr.first() else {
        return Err("Statistiche club vuote".into());
    };
    let got_id = match first.get("clubId") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    };
    if got_id != club_id {
        return Err(format!("clubId inatteso: atteso {club_id}, ricevuto {got_id}"));
    }
    if finite_num(first.get("gamesPlayed")).is_none() {
        return Err("gamesPlayed non valido".into());
    }
    Ok(())
}

pub fn validate_ea_members(members: &Value) -> Result<(), String> {
    let Some(arr) = members.get("members").and_then(|m| m.as_array()) else {
        return Err("Membri non validi".into());
    };
    if arr.is_empty() {
        return Err("Membri vuoti".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rank_and_card_profile() {
        let members = vec![
            json!({ "name": "garrus92", "gamesPlayed": "4", "goals": "2", "assists": "5", "ratingAve": "8.4", "passSuccessRate": "84", "favoritePosition": "midfielder" }),
            json!({ "name": "rich87rich", "gamesPlayed": "4", "goals": "6", "assists": "2", "ratingAve": "8.6", "passSuccessRate": "80", "favoritePosition": "forward" }),
        ];
        let matches = vec![json!({
            "matchId": "1001",
            "timestamp": 1793000000,
            "clubs": {
                "2039010": { "goals": "4", "goalsAgainst": "1", "result": "1" },
                "99999": { "goals": "1", "goalsAgainst": "4", "details": { "name": "Rivals FC" } }
            },
            "players": {
                "2039010": {
                    "1": { "playername": "rich87rich", "pos": "forward", "goals": "3", "assists": "1", "shots": "5", "passesmade": "12", "passattempts": "15", "tacklesmade": "1", "tackleattempts": "2", "saves": "0", "rating": "9.2", "redcards": "0", "mom": "1" },
                    "2": { "playername": "garrus92", "pos": "midfielder", "goals": "1", "assists": "2", "shots": "2", "passesmade": "22", "passattempts": "25", "tacklesmade": "3", "tackleattempts": "4", "saves": "0", "rating": "8.8", "redcards": "0", "mom": "0" }
                }
            }
        })];

        let ranked = rank_members(&members, &matches, "2039010");
        assert_eq!(ranked[0]["name"], "rich87rich");

        let card = compute_card_profile(&members[1], &matches, "2039010");
        assert_eq!(card["label"], "ATT");
        assert_eq!(card["basis"], "recent");
        assert!(card["score"].as_i64().unwrap() >= 80);

        let night = summarize_night(&matches, "2039010");
        assert_eq!(night["wins"], 1);
        assert_eq!(night["goals"], 4);
        assert_eq!(night["winners"][0]["name"], "rich87rich");
    }
}
