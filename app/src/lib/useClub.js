import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  CLUBS,
  readClubKeyFromLocation,
  resolveClubKey,
  setActiveClubKey,
} from './constants.js';
import { initWasmBrowser, isWasmReady, subscribeWasm } from './wasm-engine.js';

export const ClubContext = createContext({
  club: CLUBS.billocchi,
  clubKey: 'billocchi',
  switchClub: () => {},
  wasmReady: false,
});

export const useClub = () => useContext(ClubContext);

export function useClubController() {
  const [clubKey, setClubKeyState] = useState(() => {
    const initial = readClubKeyFromLocation();
    setActiveClubKey(initial);
    return initial;
  });
  const [wasmReady, setWasmReady] = useState(() => isWasmReady());

  useEffect(() => {
    setActiveClubKey(clubKey);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', CLUBS[clubKey].themeColor);
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) icon.setAttribute('href', CLUBS[clubKey].logo);
  }, [clubKey]);

  useEffect(() => {
    initWasmBrowser();
    return subscribeWasm(() => setWasmReady(true));
  }, []);

  useEffect(() => {
    const onPop = () => {
      const next = readClubKeyFromLocation();
      setActiveClubKey(next);
      setClubKeyState(next);
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const switchClub = useCallback((nextRaw) => {
    const next = resolveClubKey(nextRaw);
    setActiveClubKey(next);
    setClubKeyState(next);
    const url = new URL(window.location.href);
    if (next === 'faida') url.searchParams.set('club', 'faida');
    else url.searchParams.delete('club');
    // Se si era sulla scheda di un singolo Pro non presente o #/faida, porta in cima o conserva la vista valida
    if (url.hash === '#/faida' || url.hash === '#faida') url.hash = '';
    window.history.pushState({ club: next }, '', url.pathname + url.search + url.hash);
  }, []);

  // Sincronizza sincronamente il club attivo prima del render dei figli
  setActiveClubKey(clubKey);

  return {
    club: CLUBS[clubKey] || CLUBS.billocchi,
    clubKey,
    switchClub,
    wasmReady,
  };
}
