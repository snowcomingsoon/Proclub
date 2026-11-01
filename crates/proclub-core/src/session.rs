/// Calcolo puro di data/ora civile ed `Europe/Rome` (CET/CEST) senza dipendenze di sistema,
/// compatibile sia con `wasm32-unknown-unknown` sia con Linux/Windows nativi.

/// Converte giorni da 1970-01-01 in `(year, month 1..=12, day 1..=31)` (algoritmo di Howard Hinnant).
pub fn civil_from_days(z_in: i64) -> (i32, u32, u32) {
    let z = z_in + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = (y + if m <= 2 { 1 } else { 0 }) as i32;
    (year, m, d)
}

/// Converte `(year, month 1..=12, day 1..=31)` in giorni da 1970-01-01.
pub fn days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let y = year as i64 - if month <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32;
    let m = month;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

/// Giorno della settimana: 0 = Domenica, 1 = Lunedì, ..., 6 = Sabato.
fn weekday_from_days(days: i64) -> u32 {
    days.rem_euclid(7) as u32 // 1970-01-01 era Giovedì -> (0 + 4) % 7 = 4
}

fn last_sunday_of_month_days(year: i32, month: u32) -> i64 {
    let last_dom = match month {
        3 | 10 => 31,
        _ => 30,
    };
    let d = days_from_civil(year, month, last_dom);
    // 1970-01-01 = Giovedì (4), quindi dow (0=Dom..6=Sab) = (d + 4).rem_euclid(7)
    let dow = (d + 4).rem_euclid(7);
    d - dow
}

/// Offset di `Europe/Rome` rispetto a UTC in secondi (`3600` CET o `7200` CEST).
/// Regola UE: inizia alle 01:00 UTC dell'ultima domenica di marzo e termina alle 01:00 UTC dell'ultima domenica di ottobre.
pub fn rome_offset_seconds(utc_ts: i64) -> i64 {
    let days = utc_ts.div_euclid(86_400);
    let (year, _, _) = civil_from_days(days);
    let start_cest_utc = last_sunday_of_month_days(year, 3) * 86_400 + 3600;
    let end_cest_utc = last_sunday_of_month_days(year, 10) * 86_400 + 3600;
    if utc_ts >= start_cest_utc && utc_ts < end_cest_utc {
        7200
    } else {
        3600
    }
}

/// Giorno di serata (`YYYY-MM-DD`) secondo l'ora italiana (`Europe/Rome`):
/// le gare giocate tra `00:00` e `night_ends_at_hour - 1:59` appartengono alla serata precedente.
pub fn session_day_rome(timestamp_secs: i64, night_ends_at_hour: u32) -> String {
    let offset = rome_offset_seconds(timestamp_secs);
    let local_secs = timestamp_secs + offset;
    let mut local_days = local_secs.div_euclid(86_400);
    let sec_of_day = local_secs.rem_euclid(86_400) as u32;
    let hour = sec_of_day / 3600;
    if hour < night_ends_at_hour {
        local_days -= 1;
    }
    let (y, m, d) = civil_from_days(local_days);
    let _ = weekday_from_days; // mantenuto per completezza interna
    format!("{y:04}-{m:02}-{d:02}")
}

/// Chiave mese per l'archivio (`YYYY-MM`), con taglio alle 06:00 UTC come `scripts/lib.js`.
pub fn season_key(timestamp_secs: i64) -> String {
    let shifted = timestamp_secs - 6 * 3600;
    let days = shifted.div_euclid(86_400);
    let (y, m, _) = civil_from_days(days);
    format!("{y:04}-{m:02}")
}

/// Mese corrente (`YYYY-MM`) in `Europe/Rome` da timestamp in secondi.
pub fn rome_month_from_secs(timestamp_secs: i64) -> String {
    let local_days = (timestamp_secs + rome_offset_seconds(timestamp_secs)).div_euclid(86_400);
    let (y, m, _) = civil_from_days(local_days);
    format!("{y:04}-{m:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_day_rome_evening_and_after_midnight() {
        // 2026-10-20 22:30 CEST (UTC+2 -> 20:30 UTC)
        let d = days_from_civil(2026, 10, 20);
        let ts_evening = d * 86_400 + 20 * 3600 + 30 * 60;
        assert_eq!(session_day_rome(ts_evening, 6), "2026-10-20");

        // 2026-10-21 01:15 CEST (UTC+2 -> 2026-10-20 23:15 UTC) -> conta come serata 2026-10-20!
        let ts_late = d * 86_400 + 23 * 3600 + 15 * 60;
        assert_eq!(session_day_rome(ts_late, 6), "2026-10-20");

        // 2026-10-21 05:59 CEST (UTC+2 -> 2026-10-21 03:59 UTC) -> ancora 2026-10-20!
        let ts_559 = (d + 1) * 86_400 + 3 * 3600 + 59 * 60;
        assert_eq!(session_day_rome(ts_559, 6), "2026-10-20");

        // 2026-10-21 06:00 CEST (UTC+2 -> 2026-10-21 04:00 UTC) -> nuovo giorno 2026-10-21!
        let ts_600 = (d + 1) * 86_400 + 4 * 3600;
        assert_eq!(session_day_rome(ts_600, 6), "2026-10-21");
    }

    #[test]
    fn test_dst_switch_october() {
        // Ultima domenica di ottobre 2026 è il 25 ottobre 2026.
        // Alle 00:30 UTC del 25/10/2026 siamo ancora CEST (02:30 locali -> serata 2026-10-24).
        let d = days_from_civil(2026, 10, 25);
        assert_eq!(rome_offset_seconds(d * 86_400 + 1800), 7200);
        // Alle 01:30 UTC del 25/10/2026 siamo CET (02:30 locali -> serata 2026-10-24).
        assert_eq!(rome_offset_seconds(d * 86_400 + 5400), 3600);
        assert_eq!(session_day_rome(d * 86_400 + 5400, 6), "2026-10-24");
    }
}
