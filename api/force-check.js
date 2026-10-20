const REPO = 'snowcomingsoon/Proclub';
const WORKFLOW = 'update-data.yml';
const COOLDOWN_MS = 10 * 60 * 1000;

const githubHeaders = token => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'billocchi-club-sync',
});

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metodo non consentito' });
  }
  const token = process.env.GITHUB_SYNC_TOKEN;
  if (!token) return res.status(503).json({ error: 'Configura GITHUB_SYNC_TOKEN su Vercel.' });

  try {
    const runs = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(10000),
    });
    if (runs.ok) {
      const last = (await runs.json()).workflow_runs?.[0];
      const age = last ? Date.now() - new Date(last.created_at).getTime() : Infinity;
      if (age < COOLDOWN_MS) {
        const minutes = Math.ceil((COOLDOWN_MS - age) / 60000);
        return res.status(429).json({ error: `Controllo già eseguito da poco. Riprova tra ${minutes} min.` });
      }
    }
    const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
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
