#!/bin/bash
# Vercel "Ignored Build Step": exit 0 = salta il build, exit 1 = builda.
# Salta SOLO se tutti i file cambiati dall'ultima pubblicazione stanno dentro data/ (i dati arrivano
# a runtime da api/*). Ogni dubbio (primo commit, clone troppo corto, errore di git,
# nessun file cambiato) => builda. Per disattivare: vedi app/README.md.
set +e

# Riferimento del confronto: l'ULTIMO COMMIT PUBBLICATO (VERCEL_GIT_PREVIOUS_SHA), non il commit precedente.
# Con il bot che committa dati ogni pochi minuti, un commit di codice viene spesso soppiantato da un commit di soli
# dati arrivato subito dopo: confrontando solo con HEAD^ il codice non verrebbe mai pubblicato.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$base" ]; then
  git cat-file -e "${base}^{commit}" 2>/dev/null || { echo "ignore-build: commit pubblicato precedente non disponibile nel clone, build"; exit 1; }
else
  # Nessuna informazione sull'ultima pubblicazione: confronta con il commit precedente (primo deploy, clone shallow: builda).
  git rev-parse --verify -q 'HEAD^' >/dev/null 2>&1 || { echo "ignore-build: nessun commit precedente, build"; exit 1; }
  base='HEAD^'
fi

files=$(git diff --name-only "$base" HEAD 2>/dev/null)
[ $? -eq 0 ] || { echo "ignore-build: git diff fallito, build"; exit 1; }
[ -n "$files" ] || { echo "ignore-build: nessun file cambiato, build"; exit 1; }

# Se esiste almeno un file fuori da data/ => builda.
if printf '%s\n' "$files" | grep -qv '^data/'; then
  echo "ignore-build: modifiche fuori da data/, build"
  exit 1
fi
echo "ignore-build: solo dati (data/), build saltato"
exit 0
