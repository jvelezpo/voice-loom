const optionalEnv = (name: string): string => {
  return process.env[name]?.trim() || "";
}

const parsePositiveIntegerEnv = (name: string, fallback: number): number => {
  const value = optionalEnv(name);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Env var ${name} must be a positive integer.`);
  }

  return parsed;
}

const buildEndpoint = (baseUrl: string, path: string): string => {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export type LlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AskAiParams = {
  messages: LlmChatMessage[];
  maxOutputTokens?: number;
  responseFormat?: "json_object";
  temperature?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    message?: {
      content?: unknown;
      reasoning?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class LlmRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(`LLM request failed: ${status} ${message}`);
    this.name = "LlmRequestError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (!isRecord(part)) {
        return "";
      }

      if (typeof part.text === "string") {
        return part.text;
      }

      if (typeof part.content === "string") {
        return part.content;
      }

      return "";
    })
    .join("")
    .trim();
}

function getModelOverrides(model: string) {
  if (model.startsWith("tencent/hy3")) {
    return {
      include_reasoning: false,
      reasoning: {
        effort: "none",
      },
    };
  }

  return {};
}

function getResponseFormatOverride(
  model: string,
  responseFormat: AskAiParams["responseFormat"],
) {
  if (!responseFormat || model.startsWith("tencent/hy3")) {
    return {};
  }

  return {
    response_format: {
      type: responseFormat,
    },
  };
}

export const getLlmConfig = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey && !model) {
    return null;
  }

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY for LLM analysis.");
  }

  if (!model) {
    throw new Error("Missing OPENROUTER_MODEL for LLM analysis.");
  }

  return {
    provider: "openrouter",
    model,
    apiKey,
    endpoint: buildEndpoint(
      process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      "/chat/completions"
    ),
    maxOutputTokens: parsePositiveIntegerEnv("LLM_MAX_OUTPUT_TOKENS", 1200),
    timeoutMs: parsePositiveIntegerEnv("LLM_TIMEOUT_MS", 60000),
  };
}

export async function askAi({
  messages,
  maxOutputTokens,
  responseFormat,
  temperature = 0,
}: AskAiParams): Promise<string> {
  const config = getLlmConfig();

  if (!config) {
    throw new Error("LLM is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: maxOutputTokens ?? config.maxOutputTokens,
        ...getResponseFormatOverride(config.model, responseFormat),
        temperature,
        ...getModelOverrides(config.model),
      }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let data: ChatCompletionResponse | null = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText) as ChatCompletionResponse;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      throw new LlmRequestError(
        response.status,
        data?.error?.message || responseText || response.statusText,
      );
    }

    const choice = data?.choices?.[0];
    const content = extractTextContent(choice?.message?.content);

    if (!content) {
      throw new Error(
        [
          `LLM response did not include any content for model ${config.model}.`,
          choice?.finish_reason
            ? `finish_reason=${choice.finish_reason}`
            : null,
          choice?.native_finish_reason
            ? `native_finish_reason=${choice.native_finish_reason}`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LLM request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
