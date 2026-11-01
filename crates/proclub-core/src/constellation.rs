use serde_json::{json, Map, Value};
use std::collections::{BTreeSet, HashMap};

fn finite(v: Option<&Value>) -> Option<f64> {
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

fn non_neg(v: Option<&Value>) -> f64 {
    finite(v).unwrap_or(0.0).max(0.0)
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

fn avg(xs: &[f64]) -> Option<f64> {
    if xs.is_empty() {
        None
    } else {
        Some(xs.iter().sum::<f64>() / (xs.len() as f64))
    }
}

fn weighted_opt(components: &[(Option<f64>, f64)]) -> Option<f64> {
    let valid: Vec<(f64, f64)> = components
        .iter()
        .filter_map(|(v, w)| v.map(|val| (val, *w)))
        .collect();
    let sum_w: f64 = valid.iter().map(|(_, w)| *w).sum();
    if sum_w == 0.0 {
        None
    } else {
        Some(valid.iter().map(|(v, w)| v * w).sum::<f64>() / sum_w)
    }
}

pub fn role_contribution(p: &Value) -> Option<f64> {
    let val = |key: &str| finite(p.get(key)).filter(|&v| v >= 0.0);
    let ratio = |made: &str, attempts: &str| match (val(made), val(attempts)) {
        (Some(a), Some(b)) if b > 0.0 => Some(clamp01(a / b)),
        _ => None,
    };
    let passes = ratio("passesmade", "passattempts");
    let tackles = ratio("tacklesmade", "tackleattempts");
    let goals = val("goals");
    let assists = val("assists");
    let attack = match (goals, assists) {
        (Some(g), Some(a)) => Some(clamp01((g + 0.7 * a) / 1.5)),
        _ => None,
    };
    let clean = |key: &str| val(key).map(clamp01);

    match p.get("pos").and_then(|v| v.as_str()).unwrap_or("") {
        "forward" => weighted_opt(&[(attack, 0.8), (passes, 0.2)]),
        "midfielder" => weighted_opt(&[(passes, 0.5), (assists.map(clamp01), 0.3), (tackles, 0.2)]),
        "defender" => weighted_opt(&[
            (tackles, 0.5),
            (passes, 0.25),
            (clean("cleansheetsdef"), 0.25),
        ]),
        "goalkeeper" => {
            let save_rate = match (val("saves"), val("goalsconceded")) {
                (Some(s), Some(c)) if s + c > 0.0 => Some(clamp01(s / (s + c))),
                _ => None,
            };
            weighted_opt(&[(save_rate, 0.75), (clean("cleansheetsgk"), 0.25)])
        }
        _ => None,
    }
}

fn player_summary(rows: &[Value]) -> Value {
    let ratings: Vec<f64> = rows
        .iter()
        .filter_map(|p| finite(p.get("rating")).filter(|&v| v > 0.0))
        .collect();
    let sum = |key: &str| -> i64 { rows.iter().map(|p| non_neg(p.get(key)).round() as i64).sum() };
    let mut roles = Map::new();
    for p in rows {
        let r = p
            .get("pos")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("unknown");
        let prev = roles.get(r).and_then(|v| v.as_i64()).unwrap_or(0);
        roles.insert(r.to_string(), json!(prev + 1));
    }
    let contribs: Vec<f64> = rows.iter().filter_map(role_contribution).collect();
    json!({
        "goals": sum("goals"),
        "assists": sum("assists"),
        "rating": avg(&ratings),
        "rated": ratings.len(),
        "roles": Value::Object(roles),
        "contribution": avg(&contribs),
        "contributionGames": contribs.len(),
        "tackles": sum("tacklesmade"),
        "tackleAttempts": sum("tackleattempts"),
        "saves": sum("saves"),
        "passes": sum("passesmade"),
        "passAttempts": sum("passattempts"),
    })
}

fn rating_of(p: &Value) -> Option<f64> {
    finite(p.get("rating")).filter(|&r| r > 0.0)
}

fn combined(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(0.7 * (x + y) / 2.0 + 0.3 * x.min(y)),
        _ => None,
    }
}

fn baseline_for(games: &[Value], context: &[Value], id: &str, partner: &str) -> (Value, Option<f64>, usize) {
    let mut solo_all: Vec<&Value> = Vec::new();
    for m in context {
        let Some(players) = m.get("players").and_then(|v| v.as_array()) else {
            continue;
        };
        if players
            .iter()
            .any(|p| p.get("id").and_then(|v| v.as_str()) == Some(partner))
        {
            continue;
        }
        for p in players {
            if p.get("id").and_then(|v| v.as_str()) == Some(id) && rating_of(p).is_some() {
                solo_all.push(p);
            }
        }
    }

    let mut roles: HashMap<String, Vec<f64>> = HashMap::new();
    for p in &solo_all {
        let pos = p
            .get("pos")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if let Some(r) = rating_of(p) {
            roles.entry(pos).or_default().push(r);
        }
    }

    let mut differences: Vec<f64> = Vec::new();
    let mut used: BTreeSet<String> = BTreeSet::new();
    for m in games {
        let Some(players) = m.get("players").and_then(|v| v.as_array()) else {
            continue;
        };
        let Some(p) = players
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
        else {
            continue;
        };
        let pos = p.get("pos").and_then(|v| v.as_str()).unwrap_or("");
        if let (Some(r), Some(refs)) = (rating_of(p), roles.get(pos)) {
            if refs.len() >= 3 {
                if let Some(mean_ref) = avg(refs) {
                    differences.push(r - mean_ref);
                    used.insert(pos.to_string());
                }
            }
        }
    }

    let delta = avg(&differences);
    let shared = differences.len();
    let solo_count = solo_all
        .iter()
        .filter(|p| {
            let pos = p.get("pos").and_then(|v| v.as_str()).unwrap_or("");
            used.contains(pos)
        })
        .count();
    let roles_vec: Vec<String> = used.into_iter().collect();

    (
        json!({
            "delta": delta,
            "shared": shared,
            "solo": solo_count,
            "roles": roles_vec,
        }),
        delta,
        shared,
    )
}

pub fn chemistry_details(focus_id: &str, partner_id: &str, pair_games: &[Value], context: &[Value]) -> Value {
    let mut games = pair_games.to_vec();
    games.sort_by(|a, b| {
        let ta = finite(a.get("timestamp")).unwrap_or(0.0) as i64;
        let tb = finite(b.get("timestamp")).unwrap_or(0.0) as i64;
        ta.cmp(&tb).then_with(|| {
            let ida = a.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let idb = b.get("id").and_then(|v| v.as_str()).unwrap_or("");
            ida.cmp(idb)
        })
    });

    let count = games.len();
    struct Row {
        weight: f64,
        performance: Option<f64>,
        role: Option<f64>,
        steady: Option<f64>,
        points: f64,
    }
    let rows: Vec<Row> = games
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let players = m.get("players").and_then(|v| v.as_array());
            let a = players.and_then(|ps| {
                ps.iter()
                    .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(focus_id))
            });
            let b = players.and_then(|ps| {
                ps.iter()
                    .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(partner_id))
            });
            let ra = a.and_then(rating_of);
            let rb = b.and_then(rating_of);
            let ca = a.and_then(role_contribution);
            let cb = b.and_then(role_contribution);
            let exp = -(((count.saturating_sub(1).saturating_sub(i)) as f64) / 15.0);
            let steady = match (ra, rb) {
                (Some(x), Some(y)) => Some(if x >= 7.0 && y >= 7.0 { 1.0 } else { 0.0 }),
                _ => None,
            };
            let points = match m.get("result").and_then(|v| v.as_str()).unwrap_or("") {
                "V" => 1.0,
                "P" => 1.0 / 3.0,
                _ => 0.0,
            };
            Row {
                weight: 2.0f64.powf(exp),
                performance: combined(ra, rb),
                role: combined(ca, cb),
                steady,
                points,
            }
        })
        .collect();

    let performance = weighted_opt(
        &rows
            .iter()
            .map(|r| (r.performance, r.weight))
            .collect::<Vec<_>>(),
    );
    let role = weighted_opt(&rows.iter().map(|r| (r.role, r.weight)).collect::<Vec<_>>());
    let points_val = if count > 0 {
        weighted_opt(
            &rows
                .iter()
                .map(|r| (Some(r.points), r.weight))
                .collect::<Vec<_>>(),
        )
    } else {
        None
    };

    let (base_a, delta_a, shared_a) = baseline_for(&games, context, focus_id, partner_id);
    let (base_b, delta_b, shared_b) = baseline_for(&games, context, partner_id, focus_id);
    let lift = match (delta_a, delta_b) {
        (Some(da), Some(db)) if shared_a >= 3 && shared_b >= 3 => Some((da + db) / 2.0),
        _ => None,
    };

    let latest_start = rows.len().saturating_sub(5);
    let prev_end = latest_start;
    let prev_start = prev_end.saturating_sub(5);
    let latest: Vec<f64> = rows[latest_start..]
        .iter()
        .filter_map(|r| r.performance)
        .collect();
    let previous: Vec<f64> = rows[prev_start..prev_end]
        .iter()
        .filter_map(|r| r.performance)
        .collect();
    let trend = if latest.len() >= 3 && previous.len() >= 3 {
        match (avg(&latest), avg(&previous)) {
            (Some(l), Some(p)) => Some(l - p),
            _ => None,
        }
    } else {
        None
    };

    let valid_ratings = rows.iter().filter(|r| r.performance.is_some()).count();
    let valid_roles = rows.iter().filter(|r| r.role.is_some()).count();
    let consistency = if valid_ratings >= 3 {
        weighted_opt(&rows.iter().map(|r| (r.steady, r.weight)).collect::<Vec<_>>())
    } else {
        None
    };

    let lift_detail = match lift {
        None => "Servono almeno 3 gare valutate insieme e 3 senza il compagno negli stessi ruoli, per entrambi.".to_string(),
        Some(l) => format!(
            "Differenza media di voto: {}{:.2}. Confronto descrittivo, non effetto causale.",
            if l >= 0.0 { "+" } else { "" },
            l
        ),
    };
    let trend_detail = match trend {
        None => "Servono almeno 3 gare con entrambi i voti in ciascuno degli ultimi due blocchi da 5 gare.".to_string(),
        Some(t) => format!(
            "Ultime 5 contro le 5 precedenti: {}{:.2} nel rendimento a due.",
            if t >= 0.0 { "+" } else { "" },
            t
        ),
    };

    let comp_defs: [(&str, &str, f64, Option<f64>, String); 6] = [
        (
            "performance",
            "Rendimento a due",
            30.0,
            performance.map(|p| clamp01((p - 5.0) / 4.0)),
            "70% media dei due voti + 30% voto più basso: conta che rendano entrambi.".into(),
        ),
        (
            "role",
            "Contributo nei ruoli",
            20.0,
            role,
            "Passaggi, azioni offensive, contrasti e parate secondo il ruolo di ogni presenza; 70% media + 30% contributo più basso.".into(),
        ),
        (
            "lift",
            "Con / senza compagno",
            20.0,
            lift.map(|l| clamp01(0.5 + l / 4.0)),
            lift_detail,
        ),
        (
            "results",
            "Risultati del club",
            10.0,
            points_val,
            "Punti per gara divisi per 3 nelle presenze condivise.".into(),
        ),
        (
            "consistency",
            "Continuità della coppia",
            10.0,
            consistency,
            "Frequenza delle gare in cui entrambi hanno un voto EA di almeno 7; minimo 3 gare con entrambi i voti.".into(),
        ),
        (
            "trend",
            "Direzione recente",
            10.0,
            trend.map(|t| clamp01(0.5 + t / 4.0)),
            trend_detail,
        ),
    ];

    let weight_sum: f64 = comp_defs
        .iter()
        .filter(|(_, _, _, v, _)| v.is_some())
        .map(|(_, _, w, _, _)| *w)
        .sum();
    let raw = weighted_opt(
        &comp_defs
            .iter()
            .map(|(_, _, w, v, _)| (*v, *w))
            .collect::<Vec<_>>(),
    )
    .unwrap_or(0.5);

    let coverage = if count > 0 {
        ((valid_ratings + valid_roles) as f64) / ((2 * count) as f64)
    } else {
        0.0
    };
    let confidence = ((count as f64) / ((count as f64) + 8.0))
        * (weight_sum / 100.0)
        * (0.5 + 0.5 * coverage);
    let score = (50.0 + confidence * (raw * 100.0 - 50.0)).round() as i64;
    let conf_label = if confidence >= 0.65 {
        "Solida"
    } else if confidence >= 0.4 {
        "Intermedia"
    } else {
        "Provvisoria"
    };

    let components: Vec<Value> = comp_defs
        .into_iter()
        .map(|(key, label, weight, val, detail)| {
            let score_val = val.map(|v| (v * 100.0).round() as i64);
            let eff_w = if val.is_some() && weight_sum > 0.0 {
                (weight / weight_sum * 100.0).round() as i64
            } else {
                0
            };
            json!({
                "key": key,
                "label": label,
                "weight": weight as i64,
                "value": val,
                "detail": detail,
                "score": score_val,
                "effectiveWeight": eff_w,
            })
        })
        .collect();

    json!({
        "score": score,
        "raw": (raw * 100.0).round() as i64,
        "confidence": (confidence * 100.0).round() as i64,
        "coverage": (coverage * 100.0).round() as i64,
        "count": count,
        "confidenceLabel": conf_label,
        "components": components,
        "baseline": { "a": base_a, "b": base_b },
        "trend": trend,
        "lift": lift,
        "validRatings": valid_ratings,
        "validRoles": valid_roles,
    })
}

/// Calcola le coppie della Costellazione con punteggio d'intesa completo (`constellationPairs` + `chemistryDetails`).
pub fn compute_constellation_pairs(scoped: &[Value], focus_id: &str, role: &str) -> Vec<Value> {
    if focus_id.is_empty() {
        return Vec::new();
    }
    struct PairAcc {
        id: String,
        name: String,
        games: Vec<Value>,
        a: Vec<Value>,
        b: Vec<Value>,
    }
    let mut order: Vec<String> = Vec::new();
    let mut pairs: HashMap<String, PairAcc> = HashMap::new();

    for m in scoped {
        let Some(players) = m.get("players").and_then(|v| v.as_array()) else {
            continue;
        };
        let Some(focus) = players.iter().find(|p| {
            p.get("id").and_then(|v| v.as_str()) == Some(focus_id)
                && (role == "all" || p.get("pos").and_then(|v| v.as_str()) == Some(role))
        }) else {
            continue;
        };
        for other in players {
            let oid = other.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if oid.is_empty() || oid == focus_id {
                continue;
            }
            let oname = other
                .get("playername")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let entry = pairs.entry(oid.to_string()).or_insert_with(|| {
                order.push(oid.to_string());
                PairAcc {
                    id: oid.to_string(),
                    name: oname.clone(),
                    games: Vec::new(),
                    a: Vec::new(),
                    b: Vec::new(),
                }
            });
            entry.name = oname;
            entry.games.push(m.clone());
            entry.a.push(focus.clone());
            entry.b.push(other.clone());
        }
    }

    let mut out: Vec<Value> = order
        .into_iter()
        .filter_map(|id| pairs.remove(&id))
        .map(|p| {
            let games_len = p.games.len();
            let wins = p
                .games
                .iter()
                .filter(|m| m.get("result").and_then(|v| v.as_str()) == Some("V"))
                .count();
            let draws = p
                .games
                .iter()
                .filter(|m| m.get("result").and_then(|v| v.as_str()) == Some("P"))
                .count();
            let losses = games_len.saturating_sub(wins + draws);
            let a_sum = player_summary(&p.a);
            let b_sum = player_summary(&p.b);
            let gf: i64 = p
                .games
                .iter()
                .map(|m| finite(m.get("gf")).unwrap_or(0.0).round() as i64)
                .sum();
            let ga: i64 = p
                .games
                .iter()
                .map(|m| finite(m.get("ga")).unwrap_or(0.0).round() as i64)
                .sum();
            let goals = a_sum.get("goals").and_then(|v| v.as_i64()).unwrap_or(0)
                + b_sum.get("goals").and_then(|v| v.as_i64()).unwrap_or(0);
            let assists = a_sum.get("assists").and_then(|v| v.as_i64()).unwrap_or(0)
                + b_sum.get("assists").and_then(|v| v.as_i64()).unwrap_or(0);
            let reliability = if games_len >= 25 {
                "Campione ampio"
            } else if games_len >= 10 {
                "Campione discreto"
            } else {
                "Campione ridotto"
            };
            let analysis = chemistry_details(focus_id, &p.id, &p.games, scoped);
            let chemistry = analysis.get("score").and_then(|v| v.as_i64()).unwrap_or(50);

            json!({
                "id": p.id,
                "name": p.name,
                "games": p.games,
                "a": a_sum,
                "b": b_sum,
                "focusId": focus_id,
                "n": games_len,
                "wins": wins,
                "draws": draws,
                "losses": losses,
                "winPct": (wins as f64) / (games_len as f64) * 100.0,
                "ppg": ((wins * 3 + draws) as f64) / (games_len as f64),
                "gf": gf,
                "ga": ga,
                "goals": goals,
                "assists": assists,
                "reliability": reliability,
                "chemistry": chemistry,
                "analysis": analysis,
            })
        })
        .collect();

    out.sort_by(|a, b| {
        let ca = a.get("chemistry").and_then(|v| v.as_i64()).unwrap_or(0);
        let cb = b.get("chemistry").and_then(|v| v.as_i64()).unwrap_or(0);
        let na = a.get("n").and_then(|v| v.as_i64()).unwrap_or(0);
        let nb = b.get("n").and_then(|v| v.as_i64()).unwrap_or(0);
        let name_a = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let name_b = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        cb.cmp(&ca)
            .then_with(|| nb.cmp(&na))
            .then_with(|| name_a.cmp(name_b))
    });

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constellation_pairs_and_chemistry() {
        let scoped = vec![
            json!({
                "id": "m1",
                "timestamp": 1700000100,
                "gf": 3,
                "ga": 1,
                "result": "V",
                "opponent": "Alpha",
                "players": [
                    { "id": "p1", "playername": "rich87rich", "pos": "forward", "rating": "8.5", "goals": "2", "assists": "1", "passesmade": "12", "passattempts": "15" },
                    { "id": "p2", "playername": "garrus92", "pos": "midfielder", "rating": "8.2", "goals": "1", "assists": "2", "passesmade": "20", "passattempts": "22", "tacklesmade": "3", "tackleattempts": "4" }
                ]
            }),
            json!({
                "id": "m2",
                "timestamp": 1700000500,
                "gf": 2,
                "ga": 2,
                "result": "P",
                "opponent": "Beta",
                "players": [
                    { "id": "p1", "playername": "rich87rich", "pos": "forward", "rating": "7.6", "goals": "1", "assists": "0", "passesmade": "10", "passattempts": "14" },
                    { "id": "p2", "playername": "garrus92", "pos": "midfielder", "rating": "7.9", "goals": "0", "assists": "1", "passesmade": "18", "passattempts": "20", "tacklesmade": "2", "tackleattempts": "3" }
                ]
            }),
        ];

        let pairs = compute_constellation_pairs(&scoped, "p1", "all");
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0]["name"], "garrus92");
        assert_eq!(pairs[0]["n"], 2);
        assert_eq!(pairs[0]["wins"], 1);
        assert_eq!(pairs[0]["draws"], 1);
        assert!(pairs[0]["chemistry"].as_i64().unwrap() > 50);
    }
}
