use proclub_core::clubs::{etag_of, matches_etag, parse_query, resolve_club, valid_day, ClubSpec};
use proclub_core::derive::{health_from, history_from, night_from, summary_from};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use vercel_runtime::{Error, Request, Response, ResponseBody};

const FETCH_TIMEOUT_MS: u64 = 4000;

#[derive(Debug, Clone, Copy)]
pub enum Endpoint {
    Summary,
    History,
    Insights,
    Health,
    Night,
    Archive,
    Data,
}

#[derive(Debug)]
pub struct HttpReply {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Option<String>,
}

enum RemoteResult {
    Ok(String),
    Missing,
    Error,
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_millis(FETCH_TIMEOUT_MS))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("client HTTP valido")
    })
}

fn root_dir() -> PathBuf {
    std::env::var("DATA_ROOT")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn data_repo() -> String {
    std::env::var("DATA_REPO")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "snowcomingsoon/Proclub".to_string())
}

fn data_branch() -> String {
    std::env::var("DATA_BRANCH")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "data".to_string())
}

fn now_minute_bucket() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        / 60
}

async fn from_remote(rel: &str) -> RemoteResult {
    if std::env::var("DATA_LOCAL_ONLY").ok().as_deref() == Some("1") {
        return RemoteResult::Error;
    }
    let url = format!(
        "https://raw.githubusercontent.com/{}/{}/{}?refresh={}",
        data_repo(),
        data_branch(),
        rel,
        now_minute_bucket()
    );
    let resp = match http_client()
        .get(&url)
        .header("cache-control", "no-store")
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return RemoteResult::Error,
    };
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return RemoteResult::Missing;
    }
    if !resp.status().is_success() {
        return RemoteResult::Error;
    }
    let Ok(text) = resp.text().await else {
        return RemoteResult::Error;
    };
    if serde_json::from_str::<Value>(&text).is_err() {
        return RemoteResult::Error;
    }
    RemoteResult::Ok(text)
}

fn read_local(rel: &str) -> Option<String> {
    let mut path = root_dir();
    for seg in rel.split('/') {
        if !seg.is_empty() {
            path.push(seg);
        }
    }
    std::fs::read_to_string(path).ok()
}

fn monolith(club: ClubSpec) -> Option<Value> {
    let rel = format!("{}/data.json", club.data_dir);
    let text = read_local(&rel)?;
    serde_json::from_str(&text).ok()
}

fn error_reply(
    is_head: bool,
    status: u16,
    error_code: &str,
    extra_headers: &[(&'static str, String)],
) -> HttpReply {
    let mut headers = vec![
        ("Content-Type", "application/json; charset=utf-8".to_string()),
        ("Cache-Control", "no-store".to_string()),
        ("X-Engine", "rust".to_string()),
    ];
    headers.extend_from_slice(extra_headers);
    HttpReply {
        status,
        headers,
        body: if is_head {
            None
        } else {
            Some(json!({ "error": error_code }).to_string())
        },
    }
}

fn endpoint_spec(
    endpoint: Endpoint,
    club: ClubSpec,
    query: &HashMap<String, String>,
) -> Result<(String, u64, bool), &'static str> {
    let base = club.data_dir;
    match endpoint {
        Endpoint::Summary => Ok((format!("{base}/public/summary.json"), 60, false)),
        Endpoint::History => Ok((format!("{base}/public/history.json"), 60, false)),
        Endpoint::Insights => Ok((format!("{base}/public/insights.json"), 60, true)),
        Endpoint::Health => Ok((format!("{base}/public/health.json"), 30, false)),
        Endpoint::Archive => Ok((format!("{base}/archive/index.json"), 300, false)),
        Endpoint::Data => Ok((format!("{base}/data.json"), 60, false)),
        Endpoint::Night => {
            let day = query.get("day").map(String::as_str).unwrap_or("");
            if !valid_day(day) {
                return Err("invalid_day");
            }
            Ok((format!("{base}/public/nights/{day}.json"), 60, false))
        }
    }
}

fn derive_fallback(
    endpoint: Endpoint,
    data: &Value,
    club: ClubSpec,
    query: &HashMap<String, String>,
) -> Option<Value> {
    match endpoint {
        Endpoint::Summary => Some(summary_from(data, club.club_id)),
        Endpoint::History => Some(history_from(data, club.club_id)),
        Endpoint::Health => Some(health_from(data)),
        Endpoint::Night => {
            let day = query.get("day").map(String::as_str).unwrap_or("");
            night_from(data, day, club.club_id)
        }
        Endpoint::Insights | Endpoint::Archive | Endpoint::Data => None,
    }
}

pub async fn process_http_request(
    endpoint: Endpoint,
    method: &str,
    uri_str: &str,
    if_none_match: Option<&str>,
) -> HttpReply {
    let is_head = method == "HEAD";
    if method != "GET" && method != "HEAD" {
        return error_reply(
            is_head,
            405,
            "method_not_allowed",
            &[("Allow", "GET, HEAD".to_string())],
        );
    }

    let query = parse_query(uri_str);
    let club = match resolve_club(query.get("club").map(String::as_str)) {
        Ok(c) => c,
        Err(code) => return error_reply(is_head, 400, code, &[]),
    };

    let (rel, s_max_age, optional) = match endpoint_spec(endpoint, club, &query) {
        Ok(spec) => spec,
        Err(code) => return error_reply(is_head, 400, code, &[]),
    };

    let mut text: Option<String> = None;
    let mut source = "github";
    let mut definitive_missing = false;

    match from_remote(&rel).await {
        RemoteResult::Ok(remote_text) => {
            text = Some(remote_text);
        }
        RemoteResult::Missing => {
            definitive_missing = true;
            source = "bundle";
        }
        RemoteResult::Error => {
            source = "bundle";
        }
    }

    if text.is_none() {
        if let Some(local_text) = read_local(&rel) {
            if serde_json::from_str::<Value>(&local_text).is_ok() {
                text = Some(local_text);
            }
        }
        if text.is_none() {
            if let Some(mono) = monolith(club) {
                if let Some(derived) = derive_fallback(endpoint, &mono, club, &query) {
                    if let Ok(serialized) = serde_json::to_string(&derived) {
                        text = Some(serialized);
                        source = "monolith";
                    }
                }
            }
        }
    }

    if text.is_none() && optional {
        return HttpReply {
            status: 204,
            headers: vec![
                (
                    "Cache-Control",
                    "public, s-maxage=30, stale-while-revalidate=60".to_string(),
                ),
                ("X-Engine", "rust".to_string()),
            ],
            body: None,
        };
    }

    let Some(body_text) = text else {
        return error_reply(
            is_head,
            if definitive_missing { 404 } else { 503 },
            if definitive_missing {
                "not_found"
            } else {
                "unavailable"
            },
            &[],
        );
    };

    let etag = etag_of(&body_text);
    let cache_ctl = if source == "github" {
        format!("public, s-maxage={s_max_age}, must-revalidate")
    } else {
        "no-store".to_string()
    };

    if matches_etag(if_none_match, &etag) {
        return HttpReply {
            status: 304,
            headers: vec![
                ("Content-Type", "application/json; charset=utf-8".to_string()),
                ("Cache-Control", cache_ctl),
                ("ETag", etag),
                ("X-Data-Source", source.to_string()),
                ("X-Club", club.key.to_string()),
                ("X-Engine", "rust".to_string()),
            ],
            body: None,
        };
    }

    let byte_len = body_text.len().to_string();
    HttpReply {
        status: 200,
        headers: vec![
            ("Content-Type", "application/json; charset=utf-8".to_string()),
            ("Cache-Control", cache_ctl),
            ("ETag", etag),
            ("X-Data-Source", source.to_string()),
            ("X-Club", club.key.to_string()),
            ("X-Engine", "rust".to_string()),
            ("Content-Length", byte_len),
        ],
        body: if is_head { None } else { Some(body_text) },
    }
}

pub async fn handle_request(
    endpoint: Endpoint,
    req: Request,
) -> Result<Response<ResponseBody>, Error> {
    let method = req.method().as_str().to_string();
    let uri_str = req.uri().to_string();
    let inm = req
        .headers()
        .get("if-none-match")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let reply = process_http_request(endpoint, &method, &uri_str, inm.as_deref()).await;
    let mut builder = Response::builder().status(reply.status);
    for (k, v) in &reply.headers {
        builder = builder.header(*k, v.as_str());
    }
    let body = match reply.body {
        Some(text) => ResponseBody::from(text),
        None => ResponseBody::from(""),
    };
    Ok(builder.body(body)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_process_http_request_validation_and_methods() {
        std::env::set_var("DATA_LOCAL_ONLY", "1");
        let empty_root = std::env::temp_dir().join("proclub-rs-empty-data-root");
        let _ = std::fs::create_dir_all(&empty_root);
        std::env::set_var("DATA_ROOT", &empty_root);

        let res = process_http_request(Endpoint::Summary, "POST", "/api/summary", None).await;
        assert_eq!(res.status, 405);

        let res = process_http_request(
            Endpoint::Summary,
            "GET",
            "/api/summary?club=../secret",
            None,
        )
        .await;
        assert_eq!(res.status, 400);
        assert_eq!(res.body.unwrap(), r#"{"error":"invalid_club"}"#);

        let res =
            process_http_request(Endpoint::Night, "GET", "/api/night?day=2026-02-31", None).await;
        assert_eq!(res.status, 400);
        assert_eq!(res.body.unwrap(), r#"{"error":"invalid_day"}"#);

        let res =
            process_http_request(Endpoint::Insights, "GET", "/api/insights?club=faida", None).await;
        assert_eq!(res.status, 204);

        std::env::remove_var("DATA_ROOT");
    }
}
