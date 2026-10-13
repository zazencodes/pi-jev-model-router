# AGENTS.md

pi-jev-model-router: a Pi extension that adds `/jev <prompt>`, where Jev (TypeSafe's System 1 model) picks the model tier and thinking level for one prompt. Published to npm as `@zazencodes/pi-jev-model-router`. See `README.md` for behavior.

## Project Instructions

- Fail loudly: throw on errors. No fallback model.
- Keep the extension in the one file `pi-jev-model-router.ts`, with no build step: Pi loads TypeScript directly.
- `@earendil-works/*` packages are supplied by Pi. Keep them in `peerDependencies`, never `dependencies`.
- User-facing changes (command behavior, tiers, thinking levels, `MODELS`, install) must be reflected in `README.md`.

## Layout

- `pi-jev-model-router.ts`: the extension. `MODELS` at the top is the customization point users edit.
- `package.json`: `pi.extensions` names the entry file; `files` controls what is published to npm.
- `scripts/release.sh`, `.github/workflows/publish.yml`: release tooling (see Releasing).
- `.agents/skills/`: repo skills (`.claude/skills` links to it).

## Testing

No automated tests. Load the working copy with `pi -e ./pi-jev-model-router.ts` (needs `TYPESAFE_API_KEY` and a logged-in `openai-codex` provider) and run the prompts in the README's Try it section. To test a package install without touching the real Pi config, set `PI_CODING_AGENT_DIR` to a temporary directory before `pi install`.

## Changelog

`CHANGELOG.md`. Add an entry under `## [Unreleased]` with every user-facing change, in the subsections `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`. Read the section first and append to existing subsections. Released sections (`## [X.Y.Z] - date`) are immutable.

## Releasing

For versioning, release preparation, publishing to npm, or recovering a failed release, load and follow [.agents/skills/release/SKILL.md](.agents/skills/release/SKILL.md).
