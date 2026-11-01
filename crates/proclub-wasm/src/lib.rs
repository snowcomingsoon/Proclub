use proclub_core::constellation::compute_constellation_pairs;
use proclub_core::engine::{
    build_grade_rows, compute_card_profile, group_by_night, rank_members, summarize_night,
};
use serde_json::{json, Value};
use std::alloc::{alloc, dealloc, Layout};

#[no_mangle]
pub unsafe extern "C" fn wasm_alloc(size: usize) -> *mut u8 {
    let layout = match Layout::from_size_align(size.max(1), 4) {
        Ok(l) => l,
        Err(_) => return std::ptr::null_mut(),
    };
    alloc(layout)
}

#[no_mangle]
pub unsafe extern "C" fn wasm_free(ptr: *mut u8, size: usize) {
    if ptr.is_null() {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(size.max(1), 4) {
        dealloc(ptr, layout);
    }
}

unsafe fn run_json_op<F>(in_ptr: *const u8, in_len: usize, out_slot: *mut u32, op: F) -> i32
where
    F: FnOnce(Value) -> Result<Value, String>,
{
    if out_slot.is_null() || (in_len > 0 && in_ptr.is_null()) {
        return -1;
    }
    let bytes = if in_len == 0 {
        &[][..]
    } else {
        std::slice::from_raw_parts(in_ptr, in_len)
    };
    let parsed: Result<Value, String> = serde_json::from_slice(bytes).map_err(|e| e.to_string());
    let (code, payload) = match parsed.and_then(op) {
        Ok(val) => (0, serde_json::to_vec(&val).unwrap_or_else(|_| b"null".to_vec())),
        Err(err) => (
            1,
            serde_json::to_vec(&json!({ "error": err }))
                .unwrap_or_else(|_| br#"{"error":"wasm_error"}"#.to_vec()),
        ),
    };
    let out_len = payload.len();
    let out_ptr = wasm_alloc(out_len);
    if out_ptr.is_null() {
        return -2;
    }
    if out_len > 0 {
        std::ptr::copy_nonoverlapping(payload.as_ptr(), out_ptr, out_len);
    }
    let slot = std::slice::from_raw_parts_mut(out_slot, 2);
    slot[0] = out_ptr as u32;
    slot[1] = out_len as u32;
    code
}

/// Dispatcher JSON unico ed estendibile:
/// `{ "op": "rank_members" | "squad_cards" | "summarize_night" | "group_by_night" | "grade_rows" | "constellation_pairs", ... }`
#[no_mangle]
pub unsafe extern "C" fn wasm_invoke(in_ptr: *const u8, in_len: usize, out_slot: *mut u32) -> i32 {
    run_json_op(in_ptr, in_len, out_slot, |input| {
        let op = input
            .get("op")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let club_id = input
            .get("clubId")
            .and_then(|v| v.as_str())
            .unwrap_or("70375");

        match op.as_str() {
            "ping" => Ok(json!({ "engine": "proclub-wasm-rust", "ok": true })),
            "rank_members" => {
                let members = input
                    .get("members")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let history = input
                    .get("matchHistory")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                Ok(Value::Array(rank_members(&members, &history, club_id)))
            }
            "card_profile" => {
                let member = input.get("member").cloned().unwrap_or_else(|| json!({}));
                let matches = input
                    .get("matches")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                Ok(compute_card_profile(&member, &matches, club_id))
            }
            "squad_cards" => {
                let members = input
                    .get("members")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let matches = input
                    .get("matches")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let ranked = rank_members(&members, &matches, club_id);
                let mut cards = serde_json::Map::new();
                for m in &ranked {
                    if let Some(name) = m.get("name").and_then(|v| v.as_str()) {
                        cards.insert(
                            name.to_string(),
                            compute_card_profile(m, &matches, club_id),
                        );
                    }
                }
                Ok(json!({
                    "ranked": ranked,
                    "cards": Value::Object(cards),
                }))
            }
            "group_by_night" => {
                let matches = input
                    .get("matches")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                Ok(Value::Array(group_by_night(&matches, club_id)))
            }
            "summarize_night" => {
                let matches = input
                    .get("matches")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                Ok(summarize_night(&matches, club_id))
            }
            "grade_rows" => {
                let members = input
                    .get("members")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let matches = input
                    .get("matches")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                Ok(build_grade_rows(&members, &matches, club_id))
            }
            "constellation_pairs" => {
                let scoped = input
                    .get("scoped")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let focus_id = input
                    .get("focusId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let role = input
                    .get("role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("all");
                Ok(Value::Array(compute_constellation_pairs(
                    &scoped, focus_id, role,
                )))
            }
            _ => Err(format!("unknown_op:{op}")),
        }
    })
}
