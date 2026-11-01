import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { EvolutionProvider } from './components/Evolution.jsx';
import { DayAfter } from './components/DayAfter.jsx';
import { SiteHeader } from './components/SiteHeader.jsx';
import { useRoute } from './lib/route.js';
import { rankMembers } from './lib/defense.js';
import { ClubContext, useClubController } from './lib/useClub.js';
import { useClubData } from './lib/useClubData.js';

const Constellation = lazy(() => import('./components/Constellation.jsx').then(m => ({default: m.Constellation})));

const BelowFold = lazy(() => import('./components/BelowFold.jsx'));
const SiteFooter = lazy(() =>
  import('./components/SiteFooter.jsx').then((module) => ({
    default: module.SiteFooter,
  })),
);
const PlayerPage = lazy(() =>
  import('./components/PlayerPage.jsx').then((module) => ({
    default: module.PlayerPage,
  })),
);
const StatsPage = lazy(() =>
  import('./components/StatsPage.jsx').then((module) => ({
    default: module.StatsPage,
  })),
);

function App() {
  const clubCtrl = useClubController();
  const { club: activeClub, clubKey, wasmReady } = clubCtrl;
  const { data, connection, freshKeys, lastSync, refreshing, refresh, health } =
    useClubData(clubKey);
  const route = useRoute();
  const [belowReady, setBelowReady] = useState(false);
  const onBelowReady = useCallback(() => setBelowReady(true), []);
  const club = data.club[0];
  const playerKnown =
    route.view !== 'player' ||
    data.members.members.some(
      (member) => member.name.toLowerCase() === route.name.toLowerCase(),
    );
  const view = route.view === 'player' && !playerKnown ? 'home' : route.view;
  // Nome non valido: torna alla rosa (solo a dati live, il fallback può essere indietro).
  useEffect(() => {
    if (route.view === 'player' && !playerKnown && connection !== 'loading')
      location.replace('#rosa');
  }, [route, playerKnown, connection]);
  // Cambio vista: le pagine interne partono dall'alto; la home gestisce il proprio hash.
  useLayoutEffect(() => {
    if (view !== 'home' || !location.hash) window.scrollTo(0, 0);
  }, [view, route.name, clubKey]);
  useEffect(() => {
    document.title =
      view === 'constellation'
        ? `Costellazione — ${activeClub.name}`
        : view === 'stats'
          ? `Statistiche — ${activeClub.name}`
          : view === 'player'
            ? `${data.members.members.find((m) => m.name.toLowerCase() === route.name.toLowerCase())?.name} — ${activeClub.name}`
            : clubKey === 'faida'
              ? `${activeClub.name} — Dark Intelligence`
              : `${activeClub.name} — Club Intelligence`;
  }, [view, route.name, data, activeClub.name, clubKey]);
  const recentMatches = data.matches || [];
  const sortedMembers = useMemo(
    () => rankMembers(data.members.members, data.matchHistory || [], activeClub.id),
    [data, activeClub.id, wasmReady],
  );
  return (
    <ClubContext.Provider value={clubCtrl}>
    <EvolutionProvider data={data}><div className="site">
      <SiteHeader
        connection={connection}
        view={view}
        contentReady={belowReady}
      />
      {view === 'constellation' ? (<main><Suspense fallback={<p role="status" style={{padding:40}}>Accensione della costellazione…</p>}><Constellation data={data}/></Suspense></main>) : view === 'stats' ? (
        <main className="pg-main">
          <Suspense fallback={null}>
            <StatsPage data={data} />
          </Suspense>
        </main>
      ) : view === 'player' ? (
        <main className="pg-main">
          <Suspense fallback={null}>
            <PlayerPage data={data} name={route.name} />
          </Suspense>
        </main>
      ) : (
      <main id="top">
        <a className="constellation-entry" href="#/costellazione"><span className="constellation-entry-symbol" aria-hidden="true">✦</span><span><b>LA COSTELLAZIONE DEL CLUB</b><small>Scopri chi entra nella tua orbita. Esplora i legami tra i Pro.</small></span><strong aria-hidden="true">↗</strong></a>
        <DayAfter
          data={data}
          health={health}
          members={data.members.members}
          matches={data.matchHistory || recentMatches}
        />
        <Suspense
          fallback={<div className="below-fold-pending" aria-hidden="true" />}
        >
          <BelowFold
            data={data}
            club={club}
            members={data.members.members}
            sortedMembers={sortedMembers}
            matches={recentMatches}
            matchHistory={data.matchHistory || recentMatches}
            refresh={refresh}
            refreshing={refreshing}
            onReady={onBelowReady}
          />
        </Suspense>
      </main>
      )}
      <Suspense fallback={null}>
      <SiteFooter
        connection={connection}
        data={data}
        freshKeys={freshKeys}
        lastSync={lastSync}
        health={health}
      />
      </Suspense>
    </div></EvolutionProvider>
    </ClubContext.Provider>
  );
}

export { App as default };
