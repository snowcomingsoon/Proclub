export const CLUB_ID = '70375';

export const EA_CLUBS_URL = 'https://www.ea.com/it-it/games/ea-sports-fc/clubs';

export const CLUBS = {
  billocchi: {
    key: 'billocchi',
    id: '70375',
    name: 'BILLOCCHI CLUB',
    short: 'BILLOCCHI',
    masthead: 'IL GIORNO DOPO',
    redazione: 'REDAZIONE BILLOCCHI',
    editionTag: 'CRONACA DEL DOPOPARTITA',
    logo: '/logo-billocchi.svg',
    eaUrl: 'https://www.ea.com/it-it/games/ea-sports-fc/clubs/overview?clubId=70375&platform=common-gen5',
    archiveStaticUrl: '/archive.json',
    shareUrl: 'https://billocchi-club-omega.vercel.app/',
    themeColor: '#0b0f0c',
  },
  faida: {
    key: 'faida',
    id: '2039010',
    name: 'FAIDA FC',
    short: 'FAIDA FC',
    masthead: 'CRONACA NERA',
    redazione: 'REDAZIONE FAIDA',
    editionTag: 'BOLLETTINO NOTTURNO · NESSUNA TREGUA',
    logo: '/logo-faida.png',
    eaUrl: 'https://www.ea.com/it-it/games/ea-sports-fc/clubs/overview?clubId=2039010&platform=common-gen5',
    archiveStaticUrl: '/archive-faida.json',
    shareUrl: 'https://billocchi-club-omega.vercel.app/?club=faida',
    themeColor: '#050304',
  },
};

let activeClubKey = 'billocchi';

export function resolveClubKey(raw) {
  return raw === 'faida' ? 'faida' : 'billocchi';
}

export function readClubKeyFromLocation() {
  if (typeof location === 'undefined') return 'billocchi';
  const params = new URLSearchParams(location.search || '');
  if (params.get('club') === 'faida') return 'faida';
  if (location.hash === '#/faida' || location.hash === '#faida') return 'faida';
  return 'billocchi';
}

// In browser allinea subito il club attivo all'URL corrente prima del primo render.
if (typeof location !== 'undefined') {
  activeClubKey = readClubKeyFromLocation();
}

export function setActiveClubKey(key) {
  activeClubKey = resolveClubKey(key);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.club = activeClubKey;
  }
  return CLUBS[activeClubKey];
}

export const getActiveClub = () => CLUBS[activeClubKey] || CLUBS.billocchi;
export const getActiveClubKey = () => activeClubKey;
export const getActiveClubId = () => getActiveClub().id;

export function withClubParam(apiPath, clubKey = activeClubKey) {
  if (!clubKey || clubKey === 'billocchi') return apiPath;
  const sep = apiPath.includes('?') ? '&' : '?';
  return `${apiPath}${sep}club=${encodeURIComponent(clubKey)}`;
}
