# Changelog

## [Unreleased]

### Changed

- Changed the README install instructions to use the npm package `@zazencodes/pi-jev-model-router`

## [1.0.0] - 2026-10-13

### Added

- Added `/jev <prompt>`, which asks Jev to pick a model tier (simple, standard or complex) and a thinking level for one prompt, switches to that tier's model from the `MODELS` map, and sends the prompt to it
- Added a confirmation before a mid-session model switch, which discards the prompt cache, with the number of messages that would be re-sent at the full input price
