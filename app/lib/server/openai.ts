// Minimal OpenAI Chat Completions client via bare fetch — no SDK dependency.
// Ported from poster-otomasyon (server/services/openaiClientService.js).

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const FALLBACK_MODEL = "gpt-5.4-mini";
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;

export class OpenAiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Read at call time so a key saved from Ayarlar works without a restart. */
export function getConfiguredModel(): string {
  const raw = (process.env.OPENAI_MODEL || "").trim();
  return raw || FALLBACK_MODEL;
}

export function isOpenAiConfigured(): boolean {
  return (process.env.OPENAI_API_KEY || "").trim().length > 0;
}

function getApiKey(): string {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    throw new OpenAiError(
      "OPENAI_API_KEY ayarlı değil. Ayarlar → API Anahtarları bölümünden gir.",
      409
    );
  }
  return key;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | (
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: string } }
      )[];
};

type RequestBody = Record<string, unknown> & {
  response_format?: { type: string };
};

// If a 400 names a parameter we sent (newer models reject max_tokens / custom
// temperature / json_schema in some deployments), drop or downgrade it and retry.
function stripUnsupportedParam(body: RequestBody, errorText: string): boolean {
  let param: string | null = null;
  try {
    param = JSON.parse(errorText)?.error?.param ?? null;
  } catch {}
  if (param && Object.prototype.hasOwnProperty.call(body, param)) {
    delete body[param];
    console.warn(`[openai] removed unsupported param '${param}', retrying`);
    return true;
  }
  if (
    (errorText.includes("json_schema") || errorText.includes("response_format")) &&
    body.response_format?.type === "json_schema"
  ) {
    body.response_format = { type: "json_object" };
    console.warn("[openai] downgraded json_schema to json_object, retrying");
    return true;
  }
  for (const name of [
    "reasoning_effort",
    "max_completion_tokens",
    "max_tokens",
    "temperature",
    "response_format",
  ]) {
    if (errorText.includes(name) && Object.prototype.hasOwnProperty.call(body, name)) {
      delete body[name];
      console.warn(`[openai] removed unsupported param '${name}' (message-matched), retrying`);
      return true;
    }
  }
  return false;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export async function chatComplete(opts: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  responseFormat?: Record<string, unknown>;
  reasoningEffort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ content: string; usage: ChatUsage | null }> {
  const apiKey = getApiKey();
  const body: RequestBody = {
    model: opts.model || getConfiguredModel(),
    messages: opts.messages,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.responseFormat) body.response_format = opts.responseFormat as { type: string };
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;
  if (opts.maxTokens) body.max_completion_tokens = opts.maxTokens;

  let lastError: Error | null = null;
  let paramStrips = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 429 || response.status >= 500) {
        const snippet = (await response.text().catch(() => "")).slice(0, 300);
        lastError = new OpenAiError(`OpenAI ${response.status}: ${snippet}`, 502);
        continue; // transient — retry
      }

      if (!response.ok) {
        const errorText = (await response.text().catch(() => "")).slice(0, 600);
        if (
          response.status === 400 &&
          paramStrips < 4 &&
          stripUnsupportedParam(body, errorText)
        ) {
          paramStrips += 1;
          attempt -= 1; // does not consume the transient-retry budget
          continue;
        }
        throw new OpenAiError(
          `OpenAI isteği başarısız (${response.status}): ${errorText}`,
          response.status
        );
      }

      const data = await response.json();
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string" || !content) {
        throw new OpenAiError("OpenAI yanıtında içerik yok.", 502);
      }
      if (choice.finish_reason === "length") {
        throw new OpenAiError(
          "OpenAI yanıtı kesildi (finish_reason=length).",
          422
        );
      }
      return { content, usage: data.usage ?? null };
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        lastError = new OpenAiError("OpenAI isteği zaman aşımına uğradı.", 504);
        continue;
      }
      if (error instanceof OpenAiError && error.status !== 502) throw error;
      lastError =
        error instanceof OpenAiError
          ? error
          : new OpenAiError((error as Error).message, 502);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new OpenAiError("OpenAI isteği tekrar denemelerden sonra başarısız.", 502);
}
