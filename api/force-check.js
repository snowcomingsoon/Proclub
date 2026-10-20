const crypto = require('node:crypto');

const REPO = 'snowcomingsoon/Proclub';
const WORKFLOW = 'update-data.yml';

function sameSecret(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metodo non consentito' });
  }
  const token = process.env.GITHUB_SYNC_TOKEN;
  const key = process.env.SYNC_ADMIN_KEY;
  if (!token || !key) return res.status(503).json({ error: 'Configura GITHUB_SYNC_TOKEN e SYNC_ADMIN_KEY su Vercel.' });
  if (!sameSecret(req.headers['x-sync-key'], key)) return res.status(403).json({ error: 'Codice amministratore non valido.' });

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'billocchi-club-sync',
      },
      body: JSON.stringify({ ref: 'main' }),
      signal: AbortSignal.timeout(12000),
    });
    if (response.status !== 204) {
      console.error('GitHub workflow dispatch failed:', response.status);
      return res.status(502).json({ error: 'GitHub non ha accettato il controllo. Verifica i permessi del token.' });
    }
    return res.status(202).json({ message: 'Controllo EA avviato' });
  } catch (error) {
    console.error('GitHub workflow dispatch request failed:', error.message);
    return res.status(502).json({ error: 'GitHub non raggiungibile, riprova più tardi.' });
  }
};
