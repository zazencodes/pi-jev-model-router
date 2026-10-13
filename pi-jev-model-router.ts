import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionAPI, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent";

// Used when `jev-model-router.json` does not exist in the Pi agent directory. A config file
// replaces all of it. Models are `provider/id`, as in `/model` and `--model`.
const DEFAULT_CONFIG: Config = {
  classifier: "typesafe/jev-latest",
  tiers: {
    simple: "openai-codex/gpt-6-luna",
    standard: "openai-codex/gpt-6-sol",
    complex: "openai-codex/gpt-6-astra",
  },
  thinkingLevels: ["low", "medium", "high", "xhigh", "max"],
};

const TIER_CRITERIA = {
  simple: "A question, a lookup, or a small mechanical edit",
  standard: "An ordinary feature, bug fix, test, or code review",
  complex: "Subtle design, a cross-cutting change, or hard debugging",
};

const THINKING_CRITERIA = {
  // Pi maps "minimal" to "low" for the default models, so it is not offered.
  low: "Light reasoning for a straightforward task (including trivial work)",
  medium: "Moderate reasoning for a typical engineering task",
  high: "Deep reasoning for a difficult task",
  xhigh: "Extended reasoning for a particularly subtle or involved task",
  max: "Maximum reasoning for an exceptionally hard task",
};

type Tier = keyof typeof TIER_CRITERIA;
type Thinking = keyof typeof THINKING_CRITERIA;

interface Config {
  classifier: string;
  tiers: Partial<Record<Tier, string>>;
  thinkingLevels: Thinking[];
}

const CONFIG_FILE = "jev-model-router.json";

function loadConfig(): Config {
  const path = join(getAgentDir(), CONFIG_FILE);
  if (!existsSync(path)) return DEFAULT_CONFIG;
  const fail = (problem: string): never => {
    throw new Error(`${path}: ${problem}`);
  };
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("must be a JSON object");
  const { classifier, tiers, thinkingLevels, ...rest } = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(rest);
  if (unknownKeys.length > 0) fail(`unknown keys: ${unknownKeys.join(", ")}`);

  if (typeof classifier !== "string") fail(`"classifier" must be a "provider/id" string`);
  parseModelRef(classifier as string, fail);

  if (typeof tiers !== "object" || tiers === null || Array.isArray(tiers)) fail(`"tiers" must be an object`);
  const tierEntries = Object.entries(tiers as Record<string, unknown>);
  for (const [tier, model] of tierEntries) {
    if (!(tier in TIER_CRITERIA)) fail(`unknown tier "${tier}", expected ${Object.keys(TIER_CRITERIA).join(", ")}`);
    if (typeof model !== "string") fail(`tier "${tier}" must be a "provider/id" string`);
    parseModelRef(model as string, fail);
  }
  if (tierEntries.length < 2) fail(`"tiers" needs at least two tiers for Jev to choose from`);

  if (!Array.isArray(thinkingLevels)) fail(`"thinkingLevels" must be an array`);
  for (const level of thinkingLevels as unknown[]) {
    if (typeof level !== "string" || !(level in THINKING_CRITERIA)) {
      fail(`unknown thinking level ${JSON.stringify(level)}, expected ${Object.keys(THINKING_CRITERIA).join(", ")}`);
    }
  }
  if (new Set(thinkingLevels as unknown[]).size < 2) fail(`"thinkingLevels" needs at least two levels for Jev to choose from`);

  return raw as Config;
}

/** Splits `provider/id` at the first slash: provider IDs have none, model IDs may. */
function parseModelRef(ref: string, fail: (problem: string) => never): { provider: string; id: string } {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1) fail(`"${ref}" is not a "provider/id" model`);
  return { provider: ref.slice(0, slash), id: ref.slice(slash + 1) };
}

/** Criteria for the enabled keys only, in the order of `all`. */
function pick<K extends string>(all: Record<K, string>, enabled: readonly string[]): Record<string, string> {
  return Object.fromEntries(Object.entries<string>(all).filter(([key]) => enabled.includes(key)));
}

export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  const failConfig = (problem: string): never => {
    throw new Error(`jev-model-router config: ${problem}`);
  };
  const classifierRef = parseModelRef(config.classifier, failConfig);
  const questions = {
    tier: {
      type: "choice" as const,
      instructions: "How demanding is the software engineering work in `prompt`?",
      criteria: pick(TIER_CRITERIA, Object.keys(config.tiers)),
    },
    thinking: {
      type: "choice" as const,
      instructions: "What thinking level should the selected model use for `prompt`?",
      criteria: pick(THINKING_CRITERIA, config.thinkingLevels),
    },
  };

  /** Picks and selects the model and thinking level for `prompt`. Returns false if the user cancels. */
  async function route(prompt: string, ctx: ExtensionContext): Promise<boolean> {
    const classifier = ctx.modelRegistry.findOfType("classifier", classifierRef.provider, classifierRef.id);
    if (!classifier) throw new Error(`Classifier ${config.classifier} is not in the model registry`);

    const start = performance.now();
    const result = await ctx.modelRegistry.classify(classifier, { state: { prompt }, questions });
    const latencyMs = Math.round(performance.now() - start);
    if (result.stopReason !== "stop") throw new Error(`Jev (${config.classifier}) failed: ${result.errorMessage}`);
    const tierAnswer = result.answers.tier;
    const thinkingAnswer = result.answers.thinking;
    if (tierAnswer?.type !== "choice" || thinkingAnswer?.type !== "choice") {
      throw new Error(`Jev (${config.classifier}) did not return choice answers`);
    }
    const tier = tierAnswer.choice as Tier;
    const thinking = thinkingAnswer.choice as Thinking;

    const tierModel = config.tiers[tier];
    if (!tierModel) throw new Error(`Jev picked tier "${tier}", which is not configured`);
    const { provider, id } = parseModelRef(tierModel, failConfig);
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
        return false;
      }
    }

    if (!(await pi.setModel(model))) throw new Error(`pi.setModel failed for ${provider}/${id}`);
    pi.setThinkingLevel(thinking);
    const effectiveThinking = pi.getThinkingLevel();
    const thinkingLabel = effectiveThinking === thinking ? thinking : `${thinking} → ${effectiveThinking} (model limit)`;
    ctx.ui.notify(
      `Jev: ${tier} (p=${tierAnswer.probabilities[tier].toFixed(2)}) → ${model.id}, ` +
        `thinking ${thinkingLabel} (p=${thinkingAnswer.probabilities[thinking].toFixed(2)}) in ${latencyMs} ms`,
      "info",
    );
    return true;
  }

  pi.registerCommand("jev", {
    description: "Let Jev pick the model and thinking level for this prompt (or end a prompt with /jev)",
    handler: async (args, ctx) => {
      const prompt = args.trim();
      if (!prompt) {
        ctx.ui.notify("Usage: /jev <prompt> or <prompt> /jev", "error");
        return;
      }
      if (!ctx.isIdle()) throw new Error("Cannot switch models while the agent is working. Wait for it to finish.");
      if (await route(prompt, ctx)) pi.sendUserMessage(prompt);
    },
  });

  // `<prompt> /jev`. Pi runs `/`-prefixed commands before input handlers, so this sees only
  // prompts that do not start with a command.
  pi.on("input", async (event, ctx) => {
    const match = /^([\s\S]*\S)\s+\/jev\s*$/.exec(event.text);
    if (!match) return { action: "continue" };
    // Pi sends the original text on to the model when an input handler throws, so report the
    // error and drop the prompt instead. Print mode shows no notifications, so it gets stderr.
    try {
      if (event.streamingBehavior) {
        throw new Error("Cannot switch models while the agent is working. Wait for it to finish.");
      }
      const prompt = match[1].trim();
      return (await route(prompt, ctx)) ? { action: "transform", text: prompt } : { action: "handled" };
    } catch (error) {
      const message = `/jev: ${error instanceof Error ? error.message : String(error)}`;
      if (ctx.hasUI) ctx.ui.notify(message, "error");
      else console.error(message);
      return { action: "handled" };
    }
  });
}
