#!/usr/bin/env bash
# Bump package.json version and create an annotated git tag.
#
# Usage:
#   scripts/release.sh [patch|minor|major]
#
# Defaults to "patch". Does NOT push — caller controls cadence.

set -euo pipefail

BUMP="${1:-patch}"

case "$BUMP" in
  patch|minor|major) ;;
  *)
    echo "error: bump type must be patch | minor | major (got: $BUMP)" >&2
    exit 2
    ;;
esac

# Must run from repo root.
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Refuse to release with a dirty tree.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree is dirty. Commit or stash first." >&2
  exit 1
fi

CURRENT="$(node -p "require('./package.json').version")"
echo "current version: $CURRENT"

# Bump in package.json only — we manage the tag ourselves below.
pnpm version --no-git-tag-version "$BUMP" >/dev/null

NEW="$(node -p "require('./package.json').version")"
TAG="v${NEW}"

echo "bumped:   $CURRENT  ->  $NEW"

# Stage + commit the version bump.
git add package.json
git commit -m "chore: release ${TAG}"

# Annotated tag on the bump commit.
git tag -a "$TAG" -m "Release ${TAG}"

cat <<EOF

Created commit and tag ${TAG}.

Next steps (run when ready — this script does NOT push):

  git push origin main
  git push origin ${TAG}

Pushing the tag triggers .github/workflows/release.yml, which builds
and publishes the macOS DMG and Windows NSIS installers as a draft
GitHub Release. Open https://github.com/kimmingul/durumi/releases,
add notes, and publish.
EOF
