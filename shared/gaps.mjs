const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Buchi sospetti tra le partite di una stessa serata: un intervallo molto più lungo del ritmo
 * abituale (almeno 1.6 volte la mediana e non meno di 32 minuti) indica una partita che EA non ha restituito.
 * È una stima dal ritmo di gioco: non prova che la partita sia esistita.
 */
export function detectGaps(timestamps) {
  const t = [...new Set(timestamps.map(Number).filter(Boolean))].sort((a, b) => a - b);
  if (t.length < 4) return [];
  const steps = t.slice(1).map((x, i) => (x - t[i]) / 60);
  const typical = Math.min(median(steps), 30);
  const gaps = [];
  steps.forEach((minutes, i) => {
    if (minutes >= Math.max(1.6 * typical, 32) && minutes <= 180) {
      gaps.push({from: t[i], to: t[i + 1], minutes: Math.round(minutes), estimatedMissing: Math.max(1, Math.round(minutes / typical) - 1)});
    }
  });
  return gaps;
}
