#!/bin/bash
# Vercel "Ignored Build Step": exit 0 = salta il build, exit 1 = builda.
# Salta SOLO se tutti i file cambiati nell'ultimo commit stanno dentro data/ (i dati arrivano
# a runtime da api/*). Ogni dubbio (primo commit, clone troppo corto, errore di git,
# nessun file cambiato) => builda. Per disattivare: vedi app/README.md.
set +e

# Nessun commit precedente (primo deploy, clone shallow di profondità 1): builda.
git rev-parse --verify -q 'HEAD^' >/dev/null 2>&1 || { echo "ignore-build: nessun commit precedente, build"; exit 1; }

files=$(git diff --name-only 'HEAD^' HEAD 2>/dev/null)
[ $? -eq 0 ] || { echo "ignore-build: git diff fallito, build"; exit 1; }
[ -n "$files" ] || { echo "ignore-build: nessun file cambiato, build"; exit 1; }

# Se esiste almeno un file fuori da data/ => builda.
if printf '%s\n' "$files" | grep -qv '^data/'; then
  echo "ignore-build: modifiche fuori da data/, build"
  exit 1
fi
echo "ignore-build: solo dati (data/), build saltato"
exit 0
