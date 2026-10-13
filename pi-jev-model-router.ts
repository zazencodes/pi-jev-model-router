import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";

// The model that handles each tier. Edit this map to route to another provider.
const MODELS = {
  simple: { provider: "openai-codex", id: "gpt-6-luna" },
  standard: { provider: "openai-codex", id: "gpt-6-sol" },
  complex: { provider: "openai-codex", id: "gpt-6-astra" },
} as const;

const tierQuestion = choice("How demanding is the software engineering work in `prompt`?", {
  simple: "A question, a lookup, or a small mechanical edit",
  standard: "An ordinary feature, bug fix, test, or code review",
  complex: "Subtle design, a cross-cutting change, or hard debugging",
});

const thinkingQuestion = choice("What thinking level should the selected model use for `prompt`?", {
  // These five levels are supported by all three routed models. Pi maps "minimal" to
  // "low" for them, so don't ask Jev to predict a level the provider cannot use.
  low: "Light reasoning for a straightforward task (including trivial work)",
  medium: "Moderate reasoning for a typical engineering task",
  high: "Deep reasoning for a difficult task",
  xhigh: "Extended reasoning for a particularly subtle or involved task",
  max: "Maximum reasoning for an exceptionally hard task",
});

export default function (pi: ExtensionAPI) {
  pi.registerCommand("jev", {
    description: "Let Jev pick the model and thinking level for this prompt",
    handler: async (args, ctx) => {
      const prompt = args.trim();
      if (!prompt) {
        ctx.ui.notify("Usage: /jev <prompt>", "error");
        return;
      }

      const client = new TypeSafeClient();
      const start = performance.now();
      const { answers } = await client.systemOne({
        state: { prompt },
        questions: { tier: tierQuestion, thinking: thinkingQuestion },
      });
      const latencyMs = Math.round(performance.now() - start);
      const { choice: tier, probabilities } = answers.tier;
      const { choice: thinking, probabilities: thinkingProbabilities } = answers.thinking;

      const { provider, id } = MODELS[tier];
      const model = ctx.modelRegistry.find(provider, id);
      if (!model) throw new Error(`Jev routed to ${provider}/${id}, which is not in the model registry`);

      const current = ctx.model;
      const changesModel = current?.provider !== model.provider || current?.id !== model.id;
      const messages = ctx.sessionManager
        .getBranch()
        .filter((e) => e.type === "message" && (e.message.role === "user" || e.message.role === "assistant"));
      if (changesModel && messages.length > 0) {
        if (!ctx.hasUI) throw new Error("/jev needs to confirm a mid-session model switch, but there is no UI");
        const ok = await ctx.ui.confirm(
          "Discard prompt cache?",
          `Switching from ${current?.id} to ${model.id} discards the prompt cache. ` +
            `${messages.length} user and assistant messages will be re-sent at the full input price.`,
        );
        if (!ok) {
          ctx.ui.notify("/jev cancelled. Re-run it in a new session (/new) to avoid the cache miss.", "warning");
          return;
        }
      }

      if (!(await pi.setModel(model))) throw new Error(`pi.setModel failed for ${provider}/${id}`);
      pi.setThinkingLevel(thinking);
      const effectiveThinking = pi.getThinkingLevel();
      const thinkingLabel = effectiveThinking === thinking ? thinking : `${thinking} → ${effectiveThinking} (model limit)`;
      ctx.ui.notify(
        `Jev: ${tier} (p=${probabilities[tier].toFixed(2)}) → ${model.id}, ` +
          `thinking ${thinkingLabel} (p=${thinkingProbabilities[thinking].toFixed(2)}) in ${latencyMs} ms`,
        "info",
      );
      pi.sendUserMessage(prompt);
    },
  });
}
