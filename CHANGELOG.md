# Changelog

## [Unreleased]

## [2.0.0] - 2026-10-13

### Breaking Changes

- Replaced the `MODELS` map in the source with the config file `~/.pi/agent/jev-model-router.json`, which sets the classifier, the model for each tier, and the thinking levels Jev may pick. Without the file, the extension uses the same models and levels as before

### Added

- Added `<prompt> /jev`: ending a prompt with `/jev` routes it like `/jev <prompt>`, and works in print mode
- Added disabling tiers and thinking levels: leave them out of `jev-model-router.json`, e.g. to never route to Astra or never use `xhigh` and `max`
- Added choosing the Jev provider with `classifier` in `jev-model-router.json`, e.g. `openrouter/typesafe/jev-1.13` or `opencode/jev-1.13`

### Changed

- Changed the README install instructions to use the npm package `@zazencodes/pi-jev-model-router`
- Changed Jev calls to go through Pi's classifier models instead of `@typesafe-ai/sdk`, so the package has no dependencies

### Fixed

- Fixed `/jev` while the agent was working switching the model under the running turn and then failing with "Agent is already processing"; it now refuses before routing

## [1.0.0] - 2026-10-13

### Added

- Added `/jev <prompt>`, which asks Jev to pick a model tier (simple, standard or complex) and a thinking level for one prompt, switches to that tier's model from the `MODELS` map, and sends the prompt to it
- Added a confirmation before a mid-session model switch, which discards the prompt cache, with the number of messages that would be re-sent at the full input price
