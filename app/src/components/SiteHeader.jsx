import { useState } from 'react';
import { SectionNav } from './SectionNav.jsx';

export function SiteHeader({ connection, view = 'home', contentReady }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function requestSync() {
    setBusy(true);
    setStatus('Avvio controllo…');
    try {
      const result = await fetch('/api/force-check', {
        method: 'POST',
      });
      const body = await result.json();
      setStatus(result.ok ? 'Controllo avviato. I dati appariranno al termine della sincronizzazione.' : (body.error || 'Errore di sincronizzazione'));
    } catch {
      setStatus('Impossibile contattare il server.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="nav">
      <a className="brand" href={view === 'home' ? '#top' : '#giorno-dopo'}>
        <img
          className="site-logo"
          src="/logo-billocchi.svg"
          alt="Stemma BILLOCCHI CLUB"
          width="52"
          height="52"
        />
        <span>
          {'BILLOCCHI '}
          <b>CLUB</b>
          <small>FC 27 / CLUB INTELLIGENCE</small>
        </span>
      </a>
      <SectionNav key={view === 'home' ? 'home' : 'page'} view={view} contentReady={contentReady} />
      <div style={{display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end'}}>
        <button type="button" onClick={requestSync} disabled={busy} style={{padding:'8px 12px',borderRadius:9,background:'#facc15',color:'#111',fontWeight:700,cursor:'pointer'}}>
          {busy ? 'Avvio…' : '↻ Forza check EA'}
        </button>
        {status && <small role="status" style={{maxWidth:250,textAlign:'right'}}>{status}</small>}
      </div>
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
    </header>
  );
}
