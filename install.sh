#!/usr/bin/env bash
# Install or update the harness in a Flutter repo.
#   ./install.sh [path-to-repo]   (defaults to the current directory)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/template" && pwd)"
ROOT="$(dirname "$SRC")"
mkdir -p "${1:-.}"
DST="$(cd "${1:-.}" && pwd)"
SKILLS=(review maestro simulator grill-me)
MARKER=.agents/.harness-version

echo "harness -> $DST"

# Copy whatever is already here before touching it. An update overwrites files and
# renames skills, and there is no undo for a file that was never in git.
# mktemp, not a plain timestamp: two installs in the same second would otherwise share
# a directory and the second copy would land inside the first.
mkdir -p /tmp/flutter-agent-harness-backup
BACKUP="$(mktemp -d "/tmp/flutter-agent-harness-backup/$(basename "$DST")-$(date +%Y%m%d-%H%M%S)-XXXXXX")"
TOUCHED=(AGENTS.md .agents .claude/skills)
BACKED_UP=()
for path in "${TOUCHED[@]}"; do
  [ -e "$DST/$path" ] || continue
  mkdir -p "$BACKUP/$(dirname "$path")"
  cp -R "$DST/$path" "$BACKUP/$path"
  BACKED_UP+=("$path")
done
[ ${#BACKED_UP[@]} -gt 0 ] || rmdir "$BACKUP"
if [ ${#BACKED_UP[@]} -gt 0 ]; then
  echo "  backed up ${BACKED_UP[*]} to $BACKUP"
fi

# Skills this harness no longer ships: renamed, or folded into AGENTS.md. Left
# behind, they keep being offered next to what replaced them.
for retired in code-review verify; do
  rm -rf "${DST:?}/.agents/skills/$retired" "${DST:?}/.claude/skills/$retired"
done

# Harness owned, overwritten on every update.
mkdir -p "$DST/.agents/skills"
cp "$SRC/.agents/stack.md" "$DST/.agents/stack.md"
for s in "${SKILLS[@]}"; do
  rm -rf "${DST:?}/.agents/skills/$s"
  cp -R "$SRC/.agents/skills/$s" "$DST/.agents/skills/"
done
chmod +x "$DST/.agents/skills/simulator/scripts/ma.mjs"

# The marker means an earlier install already handed AGENTS.md over to the harness, so
# a difference is an older harness version and gets replaced. Without it, a different
# AGENTS.md is the team's own, and it keeps getting a .new beside it until that .new
# has been merged and deleted.
MERGE_NEEDED=false
CREATED=()
if [ ! -f "$DST/AGENTS.md" ] || cmp -s "$SRC/AGENTS.md" "$DST/AGENTS.md"; then
  cp "$SRC/AGENTS.md" "$DST/AGENTS.md"
  echo "  wrote AGENTS.md"
elif [ -e "$DST/$MARKER" ] && [ ! -e "$DST/AGENTS.md.new" ]; then
  cp "$SRC/AGENTS.md" "$DST/AGENTS.md"
  echo "  replaced AGENTS.md with this version of the harness"
else
  cp "$SRC/AGENTS.md" "$DST/AGENTS.md.new"
  MERGE_NEEDED=true
  CREATED+=(AGENTS.md.new)
  echo "  kept your AGENTS.md, wrote AGENTS.md.new next to it"
fi

# Team owned, written once and never touched again.
for f in project.md facts.md review-misses.md; do
  if [ -e "$DST/.agents/$f" ]; then
    echo "  kept your .agents/$f"
  else
    cp "$SRC/.agents/$f" "$DST/.agents/$f"
  fi
done

# Claude Code is the one tool that does not read .agents/skills, so link each skill in.
# Cursor, Codex, Copilot, Gemini CLI and Devin read .agents/skills directly.
# Every skill, not just ours: a project writes its own next to them.
mkdir -p "$DST/.claude/skills"
for dir in "$DST/.agents/skills"/*/; do
  s="$(basename "$dir")"
  link="$DST/.claude/skills/$s"
  if [ -L "$link" ]; then
    ln -sfn "../../.agents/skills/$s" "$link"
  elif [ -e "$link" ]; then
    echo "  .claude/skills/$s is a real directory, not linking. Delete it or rename yours"
  else
    ln -s "../../.agents/skills/$s" "$link"
  fi
done

# A starting derry.yaml, only where nothing already defines the aliases.
if [ ! -e "$DST/derry.yaml" ] && ! grep -q '^scripts:' "$DST/pubspec.yaml" 2>/dev/null; then
  cp "$SRC/derry.yaml" "$DST/derry.yaml"
  CREATED+=(derry.yaml)
  echo "  wrote derry.yaml. Add 'scripts: derry.yaml' to pubspec.yaml or derry will not find it"
fi

git -C "$ROOT" describe --always --dirty 2>/dev/null > "$DST/$MARKER" || echo unknown > "$DST/$MARKER"
echo "  recorded harness version $(cat "$DST/$MARKER") in $MARKER"

echo "  linked ${#SKILLS[@]} skills into .claude/skills for Claude Code"
echo
echo "AGENTS.md is the contract. Read it before anything else: it is short, and it"
echo "is what a human will hold the next change to."
echo
echo "Next, in order:"

step=1
if grep -q 'TODO' "$DST/.agents/project.md"; then
  echo "  $step. Fill the six commands in .agents/project.md. Nothing here works until they are real,"
  echo "     and an agent that cannot find them will invent one."
  step=$((step + 1))
fi
if [ "$MERGE_NEEDED" = true ]; then
  echo "  $step. Merge AGENTS.md.new into AGENTS.md, then delete it. From then on the installer"
  echo "     owns AGENTS.md and overwrites it, so keep nothing of yours in there."
  step=$((step + 1))
  echo "  $step. Move what was yours out of it: commands and setup into .agents/project.md,"
  echo "     migrations and anything the code cannot tell you into .agents/facts.md."
  step=$((step + 1))
fi
echo "  $step. Run the six commands once. An alias that does not run is worse than a missing one."
step=$((step + 1))
echo "  $step. Say what you did: what was written, what was kept, what you have not run yet."

if [ ${#BACKED_UP[@]} -gt 0 ]; then
  echo
  echo "To undo this install, run exactly this and nothing else:"
  printf '  rm -rf'
  for path in "${TOUCHED[@]}" ${CREATED[@]+"${CREATED[@]}"}; do printf ' "%s"' "$DST/$path"; done
  printf ' && cp -R "%s/." "%s/"\n' "$BACKUP" "$DST"
  echo "It clears everything this install wrote, then puts back what was here. An empty"
  echo ".claude directory can survive it; nothing else does."
fi
