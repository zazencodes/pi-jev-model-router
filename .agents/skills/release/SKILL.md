---
name: release
description: Prepare and publish a pi-jev-model-router release to npm. Use when asked to release, bump the version, cut a version, tag, publish, or audit the changelog before a release.
---

# Releasing pi-jev-model-router

Run commands from the repo root. A release is a `vX.Y.Z` git tag, a GitHub release, and an npm publish of `@zazencodes/pi-jev-model-router`. Pushing the tag runs `.github/workflows/publish.yml`, which publishes to npm through trusted publishing (OIDC): no npm token and no 2FA prompt. Never run `npm publish` locally.

**Versioning** (semver): `patch` = fixes and docs, `minor` = additions, `major` = breaking changes (renamed command, changed `MODELS` shape, dropped tier or thinking level).

1. **Audit the changelog.** Find the last release with `git tag --sort=-version:refname | head -1` and list the commits since it with `git log <tag>..HEAD --oneline`. Skip changelog, agent-docs and release housekeeping commits. For every other commit, check that `## [Unreleased]` in `CHANGELOG.md` has an entry, and add missing ones under the right subsection. Report what you added. If the changes break existing setups, the release must be `major` and the entry goes under `### Breaking Changes` with what users need to change.

2. **Test.** If the extension file changed, follow the Testing section of `AGENTS.md`. Failures block the release unless the user accepts the risk.

3. **Get the user's go-ahead.** Show the `[Unreleased]` section and the version it will become, and wait for confirmation. The next step pushes and publishes.

4. **Run the release script** from a clean `main` that is in sync with `origin/main`:
   ```bash
   scripts/release.sh patch|minor|major
   ```
   It bumps `package.json` and `package-lock.json` with `npm version`, turns `## [Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`, commits `Release vX.Y.Z`, tags `vX.Y.Z`, adds a fresh `## [Unreleased]` section, commits `Add [Unreleased] section for next cycle`, pushes `main` and the tag, and runs `gh release create` with that version's changelog section as the notes.

5. **Verify** the publish workflow with `gh run watch <run-id>` (`gh run list --workflow publish.yml --limit 1`), then `npm view @zazencodes/pi-jev-model-router version`. npm can take a few minutes to show a new version.

**If it fails partway**: never rerun the script for a version whose tag was already pushed.
- Push succeeded but `gh release create` failed: create the release by hand with that version's `CHANGELOG.md` section as `--notes`.
- The publish workflow failed: fix the cause, then rerun it with `gh run rerun <run-id>`. A `404`/`ENEEDAUTH` on publish means the npm trusted publisher is missing or doesn't match `zazencodes/pi-jev-model-router` + `publish.yml`; check with `npm trust list @zazencodes/pi-jev-model-router`.
- Failed before the push: delete the local tag (`git tag -d vX.Y.Z`), undo the local release commits with `git reset --keep origin/main`, and rerun.

## Changelog format

`CHANGELOG.md` follows the Pi convention. Subsections of `## [Unreleased]`, in order: `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`. Entries are one line, in past tense, and say what changed for the user (`Added /jev ..., which ...`). Released sections are immutable.
