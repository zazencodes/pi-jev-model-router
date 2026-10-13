# pi-jev-model-router

A [Pi](https://pi.dev/) extension that adds a `/jev` slash command. Put `/jev` at the end of a prompt, or at the start, and [Jev](https://typesafe.ai/), TypeSafe's System 1 model, picks the model and the thinking level for it in about 200 ms. Then the prompt goes to that model.

```text
design a plugin system for our CLI so third parties can add commands /jev
```

```text
/jev design a plugin system for our CLI so third parties can add commands
```

```text
Jev: complex (p=1.00) → gpt-6-astra, thinking high (p=0.91) in 198 ms
```

Both forms do the same thing. The trailing form lets you decide to route after you've written the prompt, and it is the one that works in print mode (`pi -p`). `/jev` anywhere else in a prompt is plain text. Prompts without `/jev` behave exactly like stock Pi.

## Install

You need [Pi](https://pi.dev/) (tested with 1.0.2) and a TypeSafe API key from <https://console.typesafe.ai/keys>.

```bash
pi install npm:@zazencodes/pi-jev-model-router
```

The package has no dependencies of its own: it calls Jev through Pi's classifier models. Add `-l` to install it for the current project only. To pull the latest version later:

```bash
pi update npm:@zazencodes/pi-jev-model-router
```

By default the extension calls Jev directly at TypeSafe, which Pi authenticates with `TYPESAFE_API_KEY`, so export it before you start Pi (to use another Jev provider, see [Customize](#customize)):

```bash
export TYPESAFE_API_KEY=your_typesafe_key
pi
```

To try it for one run without installing:

```bash
pi -e npm:@zazencodes/pi-jev-model-router
```

If `/jev` is sent to the model as plain text instead of showing a `Jev: …` notification, the extension isn't loaded. Check `pi list`.

## How it works

```text
<prompt> /jev   or   /jev <prompt>
   │
   ▼
Jev: two Choices in one call                     (~200 ms)
   tier:     simple │ standard │ complex
   thinking: low │ medium │ high │ xhigh │ max
   │
   ▼
cache guard ── mid-session switch? ── ask first
   │
   ▼
pi.setModel(Luna │ Sol │ Astra) + pi.setThinkingLevel(...)
   │
   ▼
the prompt, without /jev  ──►  the routed model answers
```

The routed model and thinking level **stay selected** after the turn. It's an ordinary model switch, shown in Pi's footer, and the next `/jev` routes again. If the model doesn't support the thinking level Jev picked, Pi clamps it and the notification shows both, e.g. `thinking max → high (model limit)`.

By default, tiers map to these models (see [Customize](#customize) to change them):

| Tier | Jev's criterion | Model |
|---|---|---|
| simple | A question, a lookup, or a small mechanical edit | `openai-codex/gpt-6-luna` |
| standard | An ordinary feature, bug fix, test, or code review | `openai-codex/gpt-6-sol` |
| complex | Subtle design, a cross-cutting change, or hard debugging | `openai-codex/gpt-6-astra` |

The defaults use the `openai-codex` provider (a ChatGPT subscription, `/login` in Pi).

### Why it pays

Standard uncached API prices per 1M tokens (USD, checked 2026-10-06):

| Tier | Model | Input | Output |
|---|---|---:|---:|
| simple | GPT-6 Luna | $0.10 | $0.50 |
| standard | GPT-6 Sol | $2.00 | $10.00 |
| complex | GPT-6 Astra | $10.00 | $50.00 |
| router | Jev | $0.042 | $0 |

Astra's token rates are 100x Luna's, so sending easy prompts to Luna saves money. Across 22 calls to Jev at TypeSafe inside Pi we measured 108–306 ms per routing decision (median 198 ms), including the network round trip. Other Jev providers add a hop: through OpenCode we measured a median of about 390 ms.

An LLM router would add another generation call before every routed prompt. Jev returns a typed label from a fixed set, with a calibrated probability, and bills input tokens only.

### Why `/jev` asks before switching

Providers cache the conversation prefix and discount later reads of it. A different model can't reuse that cache, so after a mid-session switch it may re-read the whole history at full input price. When `/jev` would switch models in a session that already has messages, it asks first and says how many messages would be re-sent. Answer No and nothing changes; re-run the prompt after `/new`.

Route at the start of a task, not in the middle of one.

## Try it

Start Pi on your usual model and try these in order:

| # | You type | Routed to | Cache warning? |
|---|---|---|---|
| 1 | `what does git rebase --onto do? Answer in one sentence. /jev` | `gpt-6-luna` | No: first prompt of the session |
| 2 | `write unit tests for the parseDuration function in utils/time.ts /jev` | `gpt-6-sol` | **Yes**: Luna → Sol mid-session |
| 3 | `Thanks. What does git bisect do? One sentence.` | not routed | No: plain prompt |
| 4 | `/jev we get an intermittent deadlock in the job queue under load, only in production. find the root cause` | `gpt-6-astra` | **Yes**: answer No to keep the model unchanged |

Then run `/new` and repeat prompt 4. On the first prompt of a fresh session it routes to Astra with no warning.

## Customize

Create `~/.pi/agent/jev-model-router.json` (in `$PI_CODING_AGENT_DIR` if you set it). This file is the defaults:

```json
{
  "classifier": "typesafe/jev-latest",
  "tiers": {
    "simple": "openai-codex/gpt-6-luna",
    "standard": "openai-codex/gpt-6-sol",
    "complex": "openai-codex/gpt-6-astra"
  },
  "thinkingLevels": ["low", "medium", "high", "xhigh", "max"]
}
```

The file replaces the defaults as a whole, so give all three keys. Run `/reload` in Pi after you edit it. Models are `provider/id`, as in `/model`.

- **`tiers`:** the model for each tier. Any chat model listed in `/model` works. Leave out a tier to disable it: without `complex`, Jev chooses between `simple` and `standard` only, so nothing goes to Astra.
- **`thinkingLevels`:** the levels Jev may pick from. Leave out `xhigh` and `max` to cap reasoning at `high`.
- **`classifier`:** the Jev model that routes. Pick the one you have credentials for:

| `classifier` | Authentication |
|---|---|
| `typesafe/jev-latest` | `TYPESAFE_API_KEY` (fastest: direct to TypeSafe) |
| `openrouter/typesafe/jev-1.13` | `OPENROUTER_API_KEY` or `/login` |
| `opencode/jev-1.13`, `opencode/jev-1.13-free` | `OPENCODE_API_KEY` |
| `vercel-ai-gateway/typesafe-ai/jev` | `AI_GATEWAY_API_KEY` |
| `cloudflare-workers-ai/typesafe/jev` | `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID` |

Each of `tiers` and `thinkingLevels` needs at least two entries for Jev to choose between. The tier names and Jev's criteria for them are fixed in [`pi-jev-model-router.ts`](pi-jev-model-router.ts). Criteria wording moves results a lot, so if you change them in a clone of the repository, test on your own prompts. A clone installs with `npm install && pi install .` and loads in place, so `/reload` picks up edits.

## Errors

The extension fails loudly and has no fallback model. You get an error, and the prompt is not sent, when:

- `jev-model-router.json` is invalid. Pi reports this when it loads the extension.
- The classifier is not configured (e.g. `TYPESAFE_API_KEY` is missing) or the Jev call fails.
- The routed model isn't in Pi's model registry. Fix `tiers`.
- `pi.setModel` fails, usually because the provider isn't logged in. Run `/login`.
- You use `/jev` while the agent is working. Wait for the run to finish.
- A mid-session switch needs confirmation and Pi has no UI (print or JSON mode).

In print mode (`pi -p`), put `/jev` at the end of the prompt. `pi -p "/jev <prompt>"` routes and then exits before the prompt runs, because Pi doesn't wait for a run that a command starts.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Releases are tagged `vX.Y.Z` and follow semver: a patch release fixes bugs or docs, a minor release adds features, and a major release contains breaking changes.

## License

[GPLv3](LICENSE). You can use, modify and share this code, and any version you distribute must also be released under GPLv3.

<p align="center">
  <a href="https://zazencodes.com/?utm_source=github&utm_medium=referral&utm_campaign=pi-jev-model-router">
    <img
      src="docs/assets/zazencodes-banner.png"
      alt="ZazenCodes — Engineering for the Agentic Era"
      width="100%"
    >
  </a>
  <br>
  Created by <a href="https://zazencodes.com/">ZazenCodes</a>
</p>
