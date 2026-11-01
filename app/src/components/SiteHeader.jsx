import { useEffect, useState } from 'react';
import { CLUBS } from '../lib/constants.js';
import { useClub } from '../lib/useClub.js';
import { SectionNav } from './SectionNav.jsx';

export function SiteHeader({ connection, view = 'home', contentReady }) {
  const { club, clubKey, switchClub, wasmReady } = useClub();
  const [vsOpen, setVsOpen] = useState(false);

  useEffect(() => {
    if (!vsOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setVsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vsOpen]);

  return (
    <header className="nav">
      <div className="club-bar" role="region" aria-label="Seleziona club">
        <span className="club-bar-label">SELEZIONA CLUB</span>
        <div className="club-switch" role="group" aria-label="Passa tra BILLOCCHI CLUB e FAIDA FC">
          <button
            type="button"
            className={`club-btn club-btn-billocchi ${clubKey === 'billocchi' ? 'active' : ''}`}
            aria-pressed={clubKey === 'billocchi'}
            onClick={() => switchClub('billocchi')}
          >
            <img src={CLUBS.billocchi.logo} alt="" width="24" height="24" />
            <span>BILLOCCHI CLUB</span>
          </button>
          <button
            type="button"
            className="club-vs-badge"
            title="Apri emblema sfida BILLOCCHI CLUB vs FAIDA FC"
            aria-label="Apri emblema sfida BILLOCCHI CLUB vs FAIDA FC"
            onClick={() => setVsOpen(true)}
          >
            <img src="/logo-sfida.png" alt="VS" width="32" height="32" />
          </button>
          <button
            type="button"
            className={`club-btn club-btn-faida ${clubKey === 'faida' ? 'active' : ''}`}
            aria-pressed={clubKey === 'faida'}
            onClick={() => switchClub('faida')}
          >
            <img src={CLUBS.faida.logo} alt="" width="24" height="24" />
            <span>FAIDA FC</span>
            <small>DARK MODE</small>
          </button>
        </div>
        <span
          className="engine-pill"
          title="API serverless Vercel, Collector EA e motore WebAssembly in Rust"
        >
          {wasmReady ? 'RUST · WASM' : 'RUST API'}
        </span>
      </div>
      {vsOpen && (
        <div
          className="vs-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Sfida BILLOCCHI CLUB vs FAIDA FC"
          onClick={() => setVsOpen(false)}
        >
          <div className="vs-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="vs-modal-close"
              aria-label="Chiudi"
              onClick={() => setVsOpen(false)}
            >
              ×
            </button>
            <span className="vs-modal-kicker">RIVALITÀ UFFICIALE · FC 27 PRO CLUBS</span>
            <img
              className="vs-modal-crest"
              src="/logo-sfida.png"
              alt="Logo sfida BILLOCCHI CLUB contro FAIDA FC"
              width="360"
              height="360"
            />
            <div className="vs-modal-actions">
              <button
                type="button"
                className="club-btn club-btn-billocchi active"
                onClick={() => {
                  switchClub('billocchi');
                  setVsOpen(false);
                }}
              >
                <img src={CLUBS.billocchi.logo} alt="" width="22" height="22" />
                <span>BILLOCCHI CLUB</span>
              </button>
              <button
                type="button"
                className="club-btn club-btn-faida active"
                onClick={() => {
                  switchClub('faida');
                  setVsOpen(false);
                }}
              >
                <img src={CLUBS.faida.logo} alt="" width="22" height="22" />
                <span>FAIDA FC</span>
              </button>
            </div>
            <a
              className="vs-modal-download"
              href="/logo-sfida-hd.jpg"
              download="billocchi-vs-faida.jpg"
            >
              Scarica logo sfida HD (1024×1024)
            </a>
          </div>
        </div>
      )}
      <div className="nav-main">
        <a className="brand" href={view === 'home' ? '#top' : '#giorno-dopo'}>
          <img
            className="site-logo"
            src={club.logo}
            alt={`Stemma ${club.name}`}
            width="52"
            height="52"
          />
          <span>
            {clubKey === 'faida' ? (
              <>
                {'FAIDA '}
                <b>FC</b>
              </>
            ) : (
              <>
                {'BILLOCCHI '}
                <b>CLUB</b>
              </>
            )}
            <small>
              {clubKey === 'faida'
                ? 'FC 27 / DARK INTELLIGENCE'
                : 'FC 27 / CLUB INTELLIGENCE'}
            </small>
          </span>
        </a>
        <SectionNav
          key={`${clubKey}-${view === 'home' ? 'home' : 'page'}`}
          view={view}
          contentReady={contentReady}
        />
        <div className="status">
          <i className={connection === 'yes' ? 'active' : ''} />
          {connection === 'yes'
            ? 'EA collegata'
            : connection === 'partial'
              ? 'EA parziale'
              : connection === 'no'
                ? 'Ultimi dati salvati'
                : 'Connessione a EA'}
        </div>
      </div>
    </header>
  );
}
