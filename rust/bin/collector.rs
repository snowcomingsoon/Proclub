use flate2::write::GzEncoder;
use flate2::Compression;
use proclub_core::derive::{
    as_i64, health_from, history_from, is_complete_match, match_id_of, nights_of, summary_from,
};
use proclub_core::engine::{
    build_archive_index, fill_missing, merge_history, validate_ea_club, validate_ea_members,
};
use proclub_core::session::{civil_from_days, season_key, session_day_rome};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const EA_BASE: &str = "https://proclubs.ea.com/api/fc";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClubConfigEntry {
    key: String,
    club_id: String,
    platform: String,
    name: String,
    data_dir: String,
    #[serde(default = "default_night_hour")]
    night_ends_at_hour: u32,
}

fn default_night_hour() -> u32 {
    6
}

fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn now_iso_utc() -> String {
    let secs = now_unix_secs();
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    let s = rem % 60;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}.000Z")
}

fn atomic_write(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    let tmp = path.with_extension(format!("tmp.{}", std::process::id()));
    fs::write(&tmp, text.as_bytes()).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("rename {}: {e}", path.display())
    })
}

fn write_json_pretty(path: &Path, val: &Value) -> Result<(), String> {
    let mut s = serde_json::to_string_pretty(val).map_err(|e| e.to_string())?;
    s.push('\n');
    atomic_write(path, &s)
}

fn write_json_compact(path: &Path, val: &Value) -> Result<(), String> {
    let mut s = serde_json::to_string(val).map_err(|e| e.to_string())?;
    s.push('\n');
    atomic_write(path, &s)
}

fn read_json_or(path: &Path, fallback: Value) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(fallback)
}

async fn fetch_ea_via_openssl(url_with_query: &str) -> Result<Value, String> {
    let script = r#"
const url = process.argv[1];
fetch(url, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    Referer: 'https://www.ea.com/',
  },
  signal: AbortSignal.timeout(20000),
}).then(async (r) => {
  if (!r.ok) { console.error('HTTP ' + r.status); process.exit(2); }
  process.stdout.write(await r.text());
}).catch((e) => { console.error(e.message); process.exit(1); });
"#;
    let out = tokio::process::Command::new("node")
        .arg("-e")
        .arg(script)
        .arg(url_with_query)
        .output()
        .await
        .map_err(|e| format!("fallback TLS: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    serde_json::from_slice(&out.stdout).map_err(|e| format!("JSON non valido: {e}"))
}

async fn fetch_ea_json(
    client: &reqwest::Client,
    endpoint: &str,
    params: &[(&str, &str)],
) -> Result<Value, String> {
    let url = format!("{EA_BASE}/{endpoint}");
    let full_url = reqwest::Url::parse_with_params(&url, params)
        .map(|u| u.to_string())
        .unwrap_or_else(|_| url.clone());
    let mut last_err = String::from("errore sconosciuto");
    for attempt in 0..3 {
        let res = client
            .get(&url)
            .query(params)
            .header("Accept", "application/json, text/plain, */*")
            .header("Accept-Language", "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7")
            .header("Origin", "https://www.ea.com")
            .header("User-Agent", USER_AGENT)
            .header("Referer", "https://www.ea.com/")
            .send()
            .await;
        match res {
            Ok(resp) if resp.status().is_success() => match resp.json::<Value>().await {
                Ok(val) => return Ok(val),
                Err(e) => last_err = format!("EA {endpoint} JSON non valido: {e}"),
            },
            Ok(resp) if resp.status().as_u16() == 403 => {
                // Akamai filtra il fingerprint TLS di rustls: usa lo stack TLS OpenSSL di sistema
                match fetch_ea_via_openssl(&full_url).await {
                    Ok(val) => return Ok(val),
                    Err(e) => last_err = format!("EA {endpoint} HTTP 403 ({e})"),
                }
            }
            Ok(resp) => {
                last_err = format!("EA {endpoint} HTTP {}", resp.status().as_u16());
            }
            Err(e) => {
                last_err = format!("EA {endpoint} rete: {e}");
            }
        }
        if attempt < 2 {
            tokio::time::sleep(Duration::from_millis(2000 * ((attempt + 1) as u64))).await;
        }
    }
    Err(last_err)
}

fn validate_ea_matches(val: &Value, club_id: &str) -> Result<Vec<Value>, String> {
    let Some(arr) = val.as_array() else {
        return Err("lista partite EA non valida".into());
    };
    for m in arr {
        if !is_complete_match(m, club_id) || as_i64(m.get("timestamp")) <= 0 {
            return Err("partita EA incompleta".into());
        }
    }
    Ok(arr.clone())
}

fn write_match_files(matches_dir: &Path, history: &[Value]) -> Result<(), String> {
    fs::create_dir_all(matches_dir).map_err(|e| e.to_string())?;
    for m in history {
        let Some(id) = match_id_of(m) else {
            continue;
        };
        let file = matches_dir.join(format!("{id}.json"));
        let next = if file.exists() {
            let ex = read_json_or(&file, Value::Null);
            fill_missing(&ex, m)
        } else {
            m.clone()
        };
        write_json_pretty(&file, &next)?;
    }
    Ok(())
}

fn write_monthly_backup(backups_dir: &Path, data_file: &Path, now_ts: i64) -> Result<(), String> {
    if !data_file.exists() {
        return Ok(());
    }
    fs::create_dir_all(backups_dir).map_err(|e| e.to_string())?;
    let month = season_key(now_ts);
    let gz_file = backups_dir.join(format!("data-{month}.json.gz"));
    if gz_file.exists() {
        return Ok(());
    }
    let raw = fs::read(data_file).map_err(|e| e.to_string())?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(&raw).map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;
    fs::write(&gz_file, compressed).map_err(|e| e.to_string())
}

async fn collect_club(
    client: &reqwest::Client,
    root: &Path,
    cfg: &ClubConfigEntry,
) -> Result<bool, String> {
    let mut base = root.to_path_buf();
    for seg in cfg.data_dir.split('/') {
        if !seg.is_empty() {
            base.push(seg);
        }
    }
    let data_file = base.join("data.json");
    let matches_dir = base.join("matches");
    let archive_index_file = base.join("archive").join("index.json");
    let backups_dir = base.join("backups");
    let public_dir = base.join("public");
    let sync_file = base.join("sync-status.json");

    let now = now_iso_utc();
    let now_ts = now_unix_secs();

    let mut stored = read_json_or(
        &data_file,
        json!({
            "capturedAt": null,
            "club": [],
            "members": { "members": [] },
            "matches": [],
            "matchHistory": [],
            "collectionStatus": { "startedAt": now }
        }),
    );

    let p_club = [("platform", cfg.platform.as_str()), ("clubIds", cfg.club_id.as_str())];
    let p_members = [("platform", cfg.platform.as_str()), ("clubId", cfg.club_id.as_str())];
    let p_league = [
        ("platform", cfg.platform.as_str()),
        ("clubIds", cfg.club_id.as_str()),
        ("matchType", "leagueMatch"),
        ("maxResultCount", "10"),
    ];
    let p_playoff = [
        ("platform", cfg.platform.as_str()),
        ("clubIds", cfg.club_id.as_str()),
        ("matchType", "playoffMatch"),
        ("maxResultCount", "10"),
    ];

    let (club_res, members_res, league_res, playoff_res) = tokio::join!(
        fetch_ea_json(client, "clubs/overallStats", &p_club),
        fetch_ea_json(client, "members/stats", &p_members),
        fetch_ea_json(client, "clubs/matches", &p_league),
        fetch_ea_json(client, "clubs/matches", &p_playoff)
    );

    let mut failures = Map::new();
    let mut stale = Map::new();
    let mut fetched_any = false;
    let mut collected_matches: Vec<Value> = Vec::new();

    match club_res.and_then(|v| validate_ea_club(&v, &cfg.club_id).map(|_| v)) {
        Ok(club_val) => {
            let old_gp = stored
                .get("club")
                .and_then(|c| c.as_array())
                .and_then(|a| a.first())
                .map(|c| as_i64(c.get("gamesPlayed")))
                .unwrap_or(0);
            let new_gp = club_val
                .as_array()
                .and_then(|a| a.first())
                .map(|c| as_i64(c.get("gamesPlayed")))
                .unwrap_or(0);
            if new_gp < old_gp {
                stale.insert("club".into(), json!("contatore del club arretrato"));
            } else {
                stored["club"] = club_val;
                fetched_any = true;
            }
        }
        Err(e) => {
            failures.insert("club".into(), json!(e));
        }
    }

    match members_res.and_then(|v| validate_ea_members(&v).map(|_| v)) {
        Ok(members_val) => {
            let mut floor: BTreeMap<String, i64> = BTreeMap::new();
            if let Some(old_arr) = stored
                .get("members")
                .and_then(|m| m.get("members"))
                .and_then(|a| a.as_array())
            {
                for m in old_arr {
                    if let Some(name) = m.get("name").and_then(|v| v.as_str()) {
                        floor.insert(name.trim().to_lowercase(), as_i64(m.get("gamesPlayed")));
                    }
                }
            }
            let regressed = members_val
                .get("members")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter().any(|m| {
                        let key = m
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim()
                            .to_lowercase();
                        let prev = floor.get(&key).copied().unwrap_or(0);
                        as_i64(m.get("gamesPlayed")) < prev
                    })
                })
                .unwrap_or(false);
            if regressed {
                stale.insert(
                    "members".into(),
                    json!("contatori dei giocatori arretrati"),
                );
            } else {
                stored["members"] = members_val;
                fetched_any = true;
            }
        }
        Err(e) => {
            failures.insert("members".into(), json!(e));
        }
    }

    let known_ids: BTreeSet<String> = stored
        .get("matchHistory")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(match_id_of).collect())
        .unwrap_or_default();

    for (mode, res) in [("leagueMatch", league_res), ("playoffMatch", playoff_res)] {
        match res.and_then(|v| validate_ea_matches(&v, &cfg.club_id)) {
            Ok(arr) => {
                fetched_any = true;
                if arr.len() >= 10
                    && !known_ids.is_empty()
                    && !arr
                        .iter()
                        .any(|m| match_id_of(m).map(|id| known_ids.contains(&id)).unwrap_or(false))
                {
                    failures.insert(
                        format!("{mode}Overflow"),
                        json!("lista EA piena senza partite già note: possibili partite perse"),
                    );
                }
                for m in arr {
                    let mut obj = m.as_object().cloned().unwrap_or_default();
                    obj.insert("sourceMatchType".into(), json!(mode));
                    collected_matches.push(Value::Object(obj));
                }
            }
            Err(e) => {
                failures.insert(mode.into(), json!(e));
            }
        }
    }

    let existing_history = stored
        .get("matchHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let existing_recent = stored
        .get("matches")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let (merged_history, fresh) = merge_history(&existing_history, &collected_matches);
    let (merged_recent, _) = merge_history(&existing_recent, &collected_matches);
    let recent_capped: Vec<Value> = merged_recent.into_iter().take(30).collect();

    stored["matchHistory"] = Value::Array(merged_history.clone());
    stored["matches"] = Value::Array(recent_capped);
    if fetched_any {
        stored["capturedAt"] = json!(now);
    }

    let started_at = stored
        .get("collectionStatus")
        .and_then(|cs| cs.get("startedAt"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| now.clone());
    let complete = failures.is_empty();
    stored["collectionStatus"] = json!({
        "startedAt": started_at,
        "checkedAt": now,
        "complete": complete,
        "healthy": complete,
        "issues": [],
        "endpointFailures": failures,
        "stale": stale,
        "attempts": 1,
        "engine": "rust-collector",
    });

    write_json_pretty(&data_file, &stored)?;
    write_json_pretty(
        &sync_file,
        &json!({
            "checkedAt": now,
            "complete": complete,
            "failures": stored["collectionStatus"]["endpointFailures"],
            "stale": stored["collectionStatus"]["stale"],
            "engine": "rust-collector",
        }),
    )?;

    write_match_files(&matches_dir, &merged_history)?;
    let existing_index = read_json_or(&archive_index_file, json!([]));
    let index_arr = existing_index.as_array().cloned().unwrap_or_default();
    let updated_index = build_archive_index(&index_arr, &merged_history, &cfg.club_id);
    write_json_pretty(&archive_index_file, &Value::Array(updated_index))?;
    let _ = write_monthly_backup(&backups_dir, &data_file, now_ts);

    // Genera il contratto pubblico base in Rust (summary, history, health, nights/*)
    let summary_val = summary_from(&stored, &cfg.club_id);
    let history_val = history_from(&stored, &cfg.club_id);
    let health_val = health_from(&stored);
    write_json_compact(&public_dir.join("summary.json"), &summary_val)?;
    write_json_compact(&public_dir.join("history.json"), &history_val)?;
    write_json_compact(&public_dir.join("health.json"), &health_val)?;

    let mut by_night: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for m in &merged_history {
        let day = session_day_rome(as_i64(m.get("timestamp")), cfg.night_ends_at_hour);
        by_night.entry(day).or_default().push(m.clone());
    }
    for (day, mut games) in by_night {
        games.sort_by(|a, b| as_i64(a.get("timestamp")).cmp(&as_i64(b.get("timestamp"))));
        write_json_compact(
            &public_dir.join("nights").join(format!("{day}.json")),
            &json!({ "day": day, "matches": games }),
        )?;
    }

    println!(
        "{}",
        json!({
            "engine": "rust",
            "club": cfg.key,
            "clubId": cfg.club_id,
            "name": cfg.name,
            "complete": complete,
            "totalMatches": merged_history.len(),
            "newMatches": fresh.len(),
            "nights": nights_of(&merged_history, cfg.night_ends_at_hour).len(),
        })
    );

    Ok(complete)
}

#[tokio::main]
async fn main() {
    let root = std::env::var("DATA_ROOT")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut only_club: Option<String> = None;
    let mut skip_insights = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--club" if i + 1 < args.len() => {
                only_club = Some(args[i + 1].clone());
                i += 2;
            }
            "--skip-insights" => {
                skip_insights = true;
                i += 1;
            }
            _ => i += 1,
        }
    }

    let clubs_path = root.join("config").join("clubs.json");
    let clubs_raw = match fs::read_to_string(&clubs_path) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("Impossibile leggere {}: {e}", clubs_path.display());
            std::process::exit(1);
        }
    };
    let clubs: Vec<ClubConfigEntry> = match serde_json::from_str(&clubs_raw) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("config/clubs.json non valido: {e}");
            std::process::exit(1);
        }
    };

    let client = reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_secs(20))
        .build()
        .expect("client HTTP EA valido");

    let mut all_ok = true;
    for cfg in &clubs {
        if let Some(ref wanted) = only_club {
            if &cfg.key != wanted && &cfg.club_id != wanted {
                continue;
            }
        }
        match collect_club(&client, &root, cfg).await {
            Ok(ok) => {
                if !ok {
                    all_ok = false;
                }
            }
            Err(e) => {
                eprintln!("Errore raccolta {}: {e}", cfg.key);
                all_ok = false;
            }
        }
    }

    // Rigenera anche insights.json (con ENGINE_ID condiviso) tramite scripts/build-public.js
    if !skip_insights {
        let build_script = root.join("scripts").join("build-public.js");
        if build_script.exists() {
            let mut cmd = Command::new("node");
            cmd.arg(&build_script).current_dir(&root);
            if let Some(ref wanted) = only_club {
                cmd.env("BUILD_ONLY_CLUB", wanted);
            }
            if let Ok(status) = cmd.status() {
                if !status.success() {
                    eprintln!("Avviso: rigenerazione insights.json terminata con codice {:?}", status.code());
                }
            }
        }
    }

    if !all_ok {
        std::process::exit(1);
    }
}
