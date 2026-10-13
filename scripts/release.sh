#!/usr/bin/env bash
# Cuts a release from the [Unreleased] section of CHANGELOG.md.
#
# Usage: scripts/release.sh <patch|minor|major>
#
# 1. Checks for a clean `main` that is in sync with origin
# 2. Bumps the version in package.json and package-lock.json
# 3. Renames [Unreleased] to [X.Y.Z] - YYYY-MM-DD, commits "Release vX.Y.Z", tags vX.Y.Z
# 4. Adds a fresh [Unreleased] section, commits "Add [Unreleased] section for next cycle"
# 5. Pushes main and the tag, then creates the GitHub release with the section as notes
#
# Pushing the tag runs .github/workflows/publish.yml, which publishes to npm.
set -euo pipefail
cd "$(dirname "$0")/.."

die() {
  echo "error: $*" >&2
  exit 1
}

bump=${1:-}
[[ $bump =~ ^(patch|minor|major)$ ]] || die "usage: scripts/release.sh <patch|minor|major>"

[[ $(git branch --show-current) == main ]] || die "not on main"
[[ -z $(git status --porcelain) ]] || die "working tree is not clean"
git fetch --quiet origin main
[[ $(git rev-parse HEAD) == $(git rev-parse origin/main) ]] || die "main is not in sync with origin/main"

notes=$(awk '/^## \[Unreleased\]$/ { found = 1; next } /^## \[/ { found = 0 } found' CHANGELOG.md)
[[ -n $(tr -d '[:space:]' <<<"$notes") ]] || die "CHANGELOG.md has no entries under ## [Unreleased]"

tag=$(npm version "$bump" --no-git-tag-version)
version=${tag#v}
git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists"

echo "Releasing $tag"
sed -i.bak "s/^## \[Unreleased\]$/## [$version] - $(date +%Y-%m-%d)/" CHANGELOG.md
rm CHANGELOG.md.bak
git add CHANGELOG.md package.json package-lock.json
git commit --quiet -m "Release $tag"
git tag -a "$tag" -m "$tag"

awk 'NR == 1 { print; print ""; print "## [Unreleased]"; next } 1' CHANGELOG.md >CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md
git add CHANGELOG.md
git commit --quiet -m "Add [Unreleased] section for next cycle"

git push --quiet origin main "$tag"
gh release create "$tag" --title "$tag" --notes "$notes"
echo "Pushed $tag. Watch the npm publish with: gh run watch \$(gh run list --workflow publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
