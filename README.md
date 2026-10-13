# pi-jev-model-router

A [Pi](https://pi.dev/) extension that adds a `/jev` slash command. Type a prompt after `/jev` and [Jev](https://typesafe.ai/), TypeSafe's System 1 model, picks the model and the thinking level for it in about 200 ms. Then the prompt goes to that model.

```text
/jev design a plugin system for our CLI so third parties can add commands
```

```text
Jev: complex (p=1.00) → gpt-6-astra, thinking high (p=0.91) in 198 ms
```

Prompts without `/jev` behave exactly like stock Pi.

## Install

You need [Pi](https://pi.dev/) (tested with 1.0.2) and a TypeSafe API key from <https://console.typesafe.ai/keys>.

```bash
pi install git:github.com/zazencodes/pi-jev-model-router
```

Pi clones the repository and installs its one dependency, `@typesafe-ai/sdk`. Add `-l` to install it for the current project only. To pull the latest version later:

```bash
pi update git:github.com/zazencodes/pi-jev-model-router
```

The extension reads `TYPESAFE_API_KEY` from the environment, so export it before you start Pi:

```bash
export TYPESAFE_API_KEY=your_typesafe_key
pi
```

To try it for one run without installing:

```bash
pi -e git:github.com/zazencodes/pi-jev-model-router
```

If `/jev` is sent to the model as plain text instead of showing a `Jev: …` notification, the extension isn't loaded. Check `pi list`.

## How it works

```text
/jev <prompt>
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
pi.sendUserMessage(prompt)  ──►  the routed model answers
```

The routed model and thinking level **stay selected** after the turn. It's an ordinary model switch, shown in Pi's footer, and the next `/jev` routes again. If the model doesn't support the thinking level Jev picked, Pi clamps it and the notification shows both, e.g. `thinking max → high (model limit)`.

Tiers map to models in the `MODELS` map at the top of [`pi-jev-model-router.ts`](pi-jev-model-router.ts):

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

Astra's token rates are 100x Luna's, so sending easy prompts to Luna saves money. Across 22 Jev calls inside Pi we measured 108–306 ms per routing decision (median 198 ms), including the network round trip.

An LLM router would add another generation call before every routed prompt. Jev returns a typed label from a fixed set, with a calibrated probability, and bills input tokens only.

### Why `/jev` asks before switching

Providers cache the conversation prefix and discount later reads of it. A different model can't reuse that cache, so after a mid-session switch it may re-read the whole history at full input price. When `/jev` would switch models in a session that already has messages, it asks first and says how many messages would be re-sent. Answer No and nothing changes; re-run the prompt after `/new`.

Route at the start of a task, not in the middle of one.

## Try it

Start Pi on your usual model and try these in order:

| # | You type | Routed to | Cache warning? |
|---|---|---|---|
| 1 | `/jev what does git rebase --onto do? Answer in one sentence.` | `gpt-6-luna` | No: first prompt of the session |
| 2 | `/jev write unit tests for the parseDuration function in utils/time.ts` | `gpt-6-sol` | **Yes**: Luna → Sol mid-session |
| 3 | `Thanks. What does git bisect do? One sentence.` | not routed | No: plain prompt |
| 4 | `/jev we get an intermittent deadlock in the job queue under load, only in production. find the root cause` | `gpt-6-astra` | **Yes**: answer No to keep the model unchanged |

Then run `/new` and repeat prompt 4. On the first prompt of a fresh session it routes to Astra with no warning.

## Customize

- **Other models or providers:** edit `MODELS`. Any model listed in `/model` works.
- **Different tiers or thinking levels:** edit the criteria in the `choice(...)` questions, or add a tier and its `MODELS` entry. Criteria wording moves results a lot, so test changes on your own prompts.

To customize, clone the repository and install your copy as a local package:

```bash
git clone https://github.com/zazencodes/pi-jev-model-router.git
cd pi-jev-model-router
npm install
pi install .
```

A local install loads the files in place, so run `/reload` in Pi after each edit.

## Errors

The extension fails loudly and has no fallback model. You get an error when:

- `TYPESAFE_API_KEY` is missing or the Jev call fails.
- The routed model isn't in Pi's model registry. Edit `MODELS`.
- `pi.setModel` fails, usually because the provider isn't logged in. Run `/login`.
- A mid-session switch needs confirmation and Pi has no UI (print or RPC mode).

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
