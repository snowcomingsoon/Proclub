/**
 * Ponte JS <-> Rust WebAssembly (`proclub_wasm.wasm`).
 * Carica il modulo compilato in Rust (`wasm32-unknown-unknown`) in modo asincrono;
 * finché l'istanza non è pronta (o nei test Node senza init esplicito) i chiamanti
 * usano in automatico il calcolo sincrono equivalente.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

let exportsRef = null;
let slotPtr = 0;
let initPromise = null;
const listeners = new Set();

function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn(true);
    } catch {
      /* listener isolato */
    }
  }
}

export const isWasmReady = () => exportsRef !== null;

export function subscribeWasm(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initWasmFromBytes(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  exportsRef = instance.exports;
  slotPtr = exportsRef.wasm_alloc(8);
  notifyListeners();
  return true;
}

export function initWasmBrowser(url = '/wasm/proclub_wasm.wasm') {
  if (exportsRef) return Promise.resolve(true);
  if (initPromise) return initPromise;
  if (typeof fetch !== 'function' || typeof WebAssembly === 'undefined') {
    return Promise.resolve(false);
  }
  initPromise = (async () => {
    try {
      let instance;
      if (typeof WebAssembly.instantiateStreaming === 'function') {
        try {
          const res = await WebAssembly.instantiateStreaming(fetch(url), {});
          instance = res.instance;
        } catch {
          const resp = await fetch(url);
          if (!resp.ok) return false;
          const buf = await resp.arrayBuffer();
          instance = (await WebAssembly.instantiate(buf, {})).instance;
        }
      } else {
        const resp = await fetch(url);
        if (!resp.ok) return false;
        const buf = await resp.arrayBuffer();
        instance = (await WebAssembly.instantiate(buf, {})).instance;
      }
      exportsRef = instance.exports;
      slotPtr = exportsRef.wasm_alloc(8);
      notifyListeners();
      return true;
    } catch {
      return false;
    }
  })();
  return initPromise;
}

export function wasmInvoke(payload) {
  if (!exportsRef || !slotPtr) return null;
  const jsonBytes = encoder.encode(JSON.stringify(payload));
  const inLen = jsonBytes.byteLength;
  const inPtr = exportsRef.wasm_alloc(Math.max(1, inLen));
  if (!inPtr) return null;
  let outPtr = 0;
  let outLen = 0;
  try {
    if (inLen > 0) {
      new Uint8Array(exportsRef.memory.buffer, inPtr, inLen).set(jsonBytes);
    }
    const code = exportsRef.wasm_invoke(inPtr, inLen, slotPtr);
    const view = new DataView(exportsRef.memory.buffer);
    outPtr = view.getUint32(slotPtr, true);
    outLen = view.getUint32(slotPtr + 4, true);
    if (code !== 0 || !outPtr) return null;
    const slice = new Uint8Array(exportsRef.memory.buffer, outPtr, outLen);
    return JSON.parse(decoder.decode(slice));
  } catch {
    return null;
  } finally {
    exportsRef.wasm_free(inPtr, Math.max(1, inLen));
    if (outPtr) exportsRef.wasm_free(outPtr, Math.max(1, outLen));
  }
}
