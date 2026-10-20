import { SectionNav } from './SectionNav.jsx';

export function SiteHeader({ connection, view = 'home', contentReady }) {
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
