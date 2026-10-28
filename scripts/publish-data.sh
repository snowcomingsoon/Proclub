#!/usr/bin/env bash
# I dati raccolti vivono nel branch "data" (non in main): così i commit del bot non fanno partire i deploy di Vercel.
# restore: porta in data/ lo stato del branch data. publish: ci pubblica data/ (commit solo se cambia qualcosa).
set -u
BRANCH="${DATA_BRANCH:-data}"

restore() {
  git fetch -q origin "$BRANCH" 2>/dev/null || return 0
  git rev-parse -q --verify "origin/$BRANCH" >/dev/null || return 0
  git checkout -q "origin/$BRANCH" -- data
}

publish() {
  git config user.name "billocchi-bot"
  git config user.email "billocchi-bot@users.noreply.github.com"
  local tmp attempt fresh
  for attempt in 1 2 3; do
    tmp=$(mktemp -d)
    git worktree prune
    git fetch -q origin "$BRANCH" 2>/dev/null
    fresh=0
    if git rev-parse -q --verify "origin/$BRANCH" >/dev/null; then
      git worktree add -q -f -B "$BRANCH" "$tmp" "origin/$BRANCH" || return 1
    else
      fresh=1
      git worktree add -q -f -B "$BRANCH" "$tmp" HEAD || return 1
    fi
    rm -rf "$tmp/data"
    cp -a data "$tmp/data"
    git -C "$tmp" add -A data
    if git -C "$tmp" diff --cached --quiet; then
      [ "$fresh" = 1 ] || { git worktree remove -f "$tmp"; return 0; }
    else
      git -C "$tmp" commit -q -m "chore: aggiorna dati EA"
    fi
    if git -C "$tmp" push -q origin "HEAD:$BRANCH"; then git worktree remove -f "$tmp"; return 0; fi
    git worktree remove -f "$tmp"
    sleep 5
  done
  echo "Push fallito: snapshot conservato negli artifact del workflow."
  return 1
}

case "${1:-}" in
  restore) restore ;;
  publish) publish ;;
  *) echo "uso: publish-data.sh restore|publish" >&2; exit 2 ;;
esac
