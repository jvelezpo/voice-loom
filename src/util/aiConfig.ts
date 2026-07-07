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