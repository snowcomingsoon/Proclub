#!/usr/bin/env bash
# Raccolta EA continua anche fuori dalla serata. Durante la serata (17:00-01:59 UTC = 19-03 italiane in estate,
# 18-02 in inverno) un'esecuzione resta attiva circa 50 minuti e interroga EA ogni 3 minuti, committando i dati
# a ogni novità; alla fine prepara il giro successivo (vedi il workflow). Così la raccolta non dipende dalla
# puntualità del cron di GitHub, che può ritardare o saltare le esecuzioni programmate.
set -u

# Each run hands off to the next, at every hour of the day. Cron is only a backup.
hour=$((10#$(date -u +%H)))
INTERVAL="${LOOP_INTERVAL:-180}"
if [ "$hour" -ge 2 ] && [ "$hour" -lt 17 ]; then INTERVAL="${LOOP_INTERVAL:-600}"; fi
duration=3000
duration="${LOOP_SECONDS:-$duration}"
# Set before collection so a failed round cannot suppress the next run.
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  if [ "$duration" -gt 0 ]; then echo "chain=1" >> "$GITHUB_OUTPUT"; else echo "chain=0" >> "$GITHUB_OUTPUT"; fi
fi

commit_data() {
  bash scripts/publish-data.sh publish
}

bash scripts/publish-data.sh restore

start=$SECONDS
status=0
rounds=0
while true; do
  rounds=$((rounds + 1))
  node scripts/update-data.js
  code=$?
  commit_data
  push_code=$?
  if [ "$code" -ne 0 ] || [ "$push_code" -ne 0 ]; then status=1; else status=0; fi
  elapsed=$((SECONDS - start))
  if [ "$duration" -le 0 ] || [ $((elapsed + INTERVAL)) -ge "$duration" ]; then break; fi
  sleep "$INTERVAL"
done

echo "Giri di raccolta: $rounds (durata ${duration}s, ultimo esito $status)"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  if [ "$duration" -gt 0 ]; then echo "chain=1" >> "$GITHUB_OUTPUT"; else echo "chain=0" >> "$GITHUB_OUTPUT"; fi
fi
exit "$status"
