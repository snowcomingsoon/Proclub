#!/usr/bin/env bash
# Raccolta EA. Fuori dalla serata: un solo giro. Durante la serata (17:00-01:59 UTC = 19-03 italiane in estate,
# 18-02 in inverno) un'esecuzione resta attiva circa 50 minuti e interroga EA ogni 3 minuti, committando i dati
# a ogni novità; alla fine prepara il giro successivo (vedi il workflow). Così la raccolta non dipende dalla
# puntualità del cron di GitHub, che può ritardare o saltare le esecuzioni programmate.
set -u

INTERVAL="${LOOP_INTERVAL:-180}"
hour=$((10#$(date -u +%H)))
event="${GITHUB_EVENT_NAME:-manual}"
duration="${LOOP_SECONDS:-}"
if [ -z "$duration" ]; then
  duration=0
  if [ "$event" = "schedule" ] || [ "$event" = "workflow_dispatch" ]; then
    if [ "$hour" -ge 17 ] || [ "$hour" -le 1 ]; then duration=3000; fi
  fi
fi

commit_data() {
  git config user.name "billocchi-bot"
  git config user.email "billocchi-bot@users.noreply.github.com"
  git add data
  if git diff --cached --quiet; then return 0; fi
  git commit -q -m "chore: aggiorna dati EA"
  for attempt in 1 2 3; do
    if git pull -q --rebase origin main && git push -q origin HEAD:main; then return 0; fi
    git rebase --abort 2>/dev/null || true
    sleep 5
  done
  echo "Push fallito: snapshot conservato negli artifact del workflow."
  return 1
}

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
