use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha1::{Digest, Sha1};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClubSpec {
    pub key: &'static str,
    pub club_id: &'static str,
    pub name: &'static str,
    pub data_dir: &'static str,
    pub platform: &'static str,
}

pub const BILLOCCHI: ClubSpec = ClubSpec {
    key: "billocchi",
    club_id: "70375",
    name: "BILLOCCHI CLUB",
    data_dir: "data",
    platform: "common-gen5",
};

pub const FAIDA: ClubSpec = ClubSpec {
    key: "faida",
    club_id: "2039010",
    name: "FAIDA FC",
    data_dir: "data/clubs/faida",
    platform: "common-gen5",
};

pub const ALL_CLUBS: [ClubSpec; 2] = [BILLOCCHI, FAIDA];

/// Risolve e valida il parametro `?club=...` senza permettere path traversal.
pub fn resolve_club(param: Option<&str>) -> Result<ClubSpec, &'static str> {
    match param {
        None | Some("") | Some("billocchi") => Ok(BILLOCCHI),
        Some("faida") => Ok(FAIDA),
        Some(_) => Err("invalid_club"),
    }
}

pub fn resolve_club_by_id(club_id: &str) -> ClubSpec {
    if club_id == FAIDA.club_id {
        FAIDA
    } else {
        BILLOCCHI
    }
}

/// Valida una data rigorosa nel formato `YYYY-MM-DD` (calendario gregoriano reale, niente `2026-02-31`).
pub fn valid_day(day: &str) -> bool {
    if day.len() != 10 {
        return false;
    }
    let b = day.as_bytes();
    if b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    if !b
        .iter()
        .enumerate()
        .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let Ok(year) = day[0..4].parse::<i32>() else {
        return false;
    };
    let Ok(month) = day[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(dom) = day[8..10].parse::<u32>() else {
        return false;
    };
    if year < 1970 || !(1..=12).contains(&month) || dom < 1 {
        return false;
    }
    let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap {
                29
            } else {
                28
            }
        }
        _ => return false,
    };
    dom <= max_day
}

/// ETag SHA-1 base64url compatibile al 100% con il contratto HTTP del sito.
pub fn etag_of(text: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(text.as_bytes());
    let digest = hasher.finalize();
    let encoded = URL_SAFE_NO_PAD.encode(digest);
    let short = if encoded.len() > 27 {
        &encoded[..27]
    } else {
        &encoded
    };
    format!("\"{short}\"")
}

/// Confronta `If-None-Match` (inclusi `W/` e liste separate da virgola o `*`).
pub fn matches_etag(header: Option<&str>, etag: &str) -> bool {
    let Some(raw) = header else {
        return false;
    };
    if raw.trim() == "*" {
        return true;
    }
    raw.split(',')
        .map(|tag| {
            let trimmed = tag.trim();
            trimmed.strip_prefix("W/").unwrap_or(trimmed)
        })
        .any(|candidate| candidate == etag)
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
        } else if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
            out.push(bytes[i]);
            i += 1;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Estrae la query string come mappa chiave -> ultimo valore (stessa semantica di `Object.fromEntries(new URLSearchParams(...))`).
pub fn parse_query(url_or_query: &str) -> HashMap<String, String> {
    let q = match url_or_query.find('?') {
        Some(idx) => &url_or_query[idx + 1..],
        None => "",
    };
    let q = q.split('#').next().unwrap_or("");
    let mut map = HashMap::new();
    for pair in q.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = match pair.find('=') {
            Some(eq) => (&pair[..eq], &pair[eq + 1..]),
            None => (pair, ""),
        };
        map.insert(percent_decode(k), percent_decode(v));
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_club() {
        assert_eq!(resolve_club(None), Ok(BILLOCCHI));
        assert_eq!(resolve_club(Some("")), Ok(BILLOCCHI));
        assert_eq!(resolve_club(Some("billocchi")), Ok(BILLOCCHI));
        assert_eq!(resolve_club(Some("faida")), Ok(FAIDA));
        assert_eq!(resolve_club(Some("../etc")), Err("invalid_club"));
        assert_eq!(resolve_club(Some("altro")), Err("invalid_club"));
    }

    #[test]
    fn test_valid_day() {
        assert!(valid_day("2026-10-20"));
        assert!(valid_day("2024-02-29"));
        assert!(!valid_day("2026-02-29"));
        assert!(!valid_day("2026-02-31"));
        assert!(!valid_day("2026-13-01"));
        assert!(!valid_day("2026-10-2"));
        assert!(!valid_day("../../data/data"));
        assert!(!valid_day("2026-10-20\0"));
    }

    #[test]
    fn test_etag_and_query() {
        let tag = etag_of("{\"a\":1}");
        assert!(tag.starts_with('"') && tag.ends_with('"'));
        assert!(matches_etag(Some(&tag), &tag));
        assert!(matches_etag(Some(&format!("W/{tag}")), &tag));
        assert!(matches_etag(Some(&format!("\"zzz\", {tag}")), &tag));
        assert!(matches_etag(Some("*"), &tag));
        assert!(!matches_etag(Some("\"altro\""), &tag));

        let q = parse_query("/api/night?day=2026-10-20&day=..%2Fx");
        assert_eq!(q.get("day").map(String::as_str), Some("../x"));
    }
}
