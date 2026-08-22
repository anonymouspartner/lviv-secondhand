#!/bin/bash
# SessionStart hook — Claude Code on the web.
#
# Exists because of one specific failure: the remote container re-clones this
# repo at a stale commit AND carries a stale origin ref, so `git status` and
# `git log origin/main` both report the checkout as current when it is dozens
# of commits behind. Work then gets built on old data — during one session that
# produced a store id that was already taken on the real main.
#
# The fix is a forced fetch before any of that is trusted, then a loud report.
# It deliberately does NOT reset or checkout anything: a session may legitimately
# start on a feature branch, and discarding someone's work to "fix" freshness
# would be far worse than the problem.
set -uo pipefail

# Local runs clone normally and don't have the stale-ref problem.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}" || exit 0

say() { printf '%s\n' "$*"; }

# ── 1. Repo freshness ───────────────────────────────────────────────────────
if git rev-parse --git-dir >/dev/null 2>&1; then
  # --force because the stale ref is the thing being corrected; without it a
  # non-fast-forward remote ref is silently left at its old value.
  if ! git fetch --force --prune --quiet origin 2>/dev/null; then
    say "⚠️  SessionStart: could not reach origin. Treat all git state as unverified."
  else
    DEFAULT="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
    DEFAULT="${DEFAULT#origin/}"
    [ -n "$DEFAULT" ] || DEFAULT=main

    if git rev-parse --verify --quiet "origin/$DEFAULT" >/dev/null; then
      BEHIND="$(git rev-list --count "HEAD..origin/$DEFAULT" 2>/dev/null || echo 0)"
      AHEAD="$(git rev-list --count "origin/$DEFAULT..HEAD" 2>/dev/null || echo 0)"
      BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"

      # A squash-merged branch is always "behind": its commit is not an
      # ancestor of the squashed one even though its content is already in.
      # An empty tree diff separates that harmless case from a genuinely stale
      # checkout — and crying wolf on every merged branch would train everyone
      # to scroll past the real warning.
      if [ "$BEHIND" -gt 0 ] && git diff --quiet HEAD "origin/$DEFAULT" 2>/dev/null; then
        say "✓ repo fresh — $BRANCH differs from origin/$DEFAULT in history only (squash merge); trees are identical"
      elif [ "$BEHIND" -gt 0 ]; then
        say ""
        say "⚠️  ═══════════════════════════════════════════════════════════════"
        say "⚠️  THIS CHECKOUT IS $BEHIND COMMIT(S) BEHIND origin/$DEFAULT"
        say "⚠️"
        say "⚠️    branch : $BRANCH  ($AHEAD ahead, $BEHIND behind)"
        say "⚠️    HEAD   : $(git log -1 --format='%h %s' 2>/dev/null | cut -c1-70)"
        say "⚠️    remote : $(git log -1 --format='%h %s' "origin/$DEFAULT" 2>/dev/null | cut -c1-70)"
        say "⚠️"
        say "⚠️  Do NOT trust file contents, store ids, or 'git status' until this"
        say "⚠️  is resolved. On a branch with no unmerged work:"
        say "⚠️    git checkout -B <branch> origin/$DEFAULT"
        say "⚠️  With unmerged work, rebase onto it instead of resetting."
        say "⚠️  ═══════════════════════════════════════════════════════════════"
        say ""
      else
        say "✓ repo fresh — $BRANCH is up to date with origin/$DEFAULT ($AHEAD ahead)"
      fi
    fi
  fi
fi

# ── 2. Deps that vanish when the container is re-provisioned ────────────────
# Only tools/social needs any: the CI gates and both Workers are plain Node.
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD stops npm pulling a browser build that would
# not match the pre-baked one below.
if [ -f tools/social/package.json ] && [ ! -d tools/social/node_modules ]; then
  say "· installing tools/social dependencies…"
  ( cd tools/social && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund --silent ) \
    && say "✓ tools/social ready" \
    || say "⚠️  tools/social npm install failed — image generation will not run"
fi

# ── 3. Resolve the pre-baked Chromium once ─────────────────────────────────
# PLAYWRIGHT_BROWSERS_PATH points at a directory of versioned builds, not at a
# binary, and the unversioned path that looks obvious does not exist. Export the
# real one so nothing has to go looking for it mid-session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  CHROME="$(find "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" -maxdepth 3 -type f -name chrome 2>/dev/null | head -1)"
  if [ -n "$CHROME" ]; then
    echo "export CHROMIUM_BIN=\"$CHROME\"" >> "$CLAUDE_ENV_FILE"
    say "✓ CHROMIUM_BIN=$CHROME"
  fi
fi

exit 0
