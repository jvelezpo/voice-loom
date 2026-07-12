import { askAi, LlmRequestError } from "@/util/aiConfig";

export type AudioCharacterAnalysis = {
  name: string;
  description: string;
};

export type AudioTextTurnAnalysis = {
  order: number;
  characterName: string;
  text: string;
};

export type AudioTextAnalysisResult = {
  languageCode: string;
  languageName: string;
  characters: AudioCharacterAnalysis[];
  turns: AudioTextTurnAnalysis[];
};

const MIN_ANALYSIS_OUTPUT_TOKENS = 4000;
const MAX_ANALYSIS_OUTPUT_TOKENS = 12000;

const systemPrompt = [
  "You prepare source text metadata for future text-to-speech audio generation.",
  "Identify the text language and the distinct speaking characters explicitly present in the text.",
  "When a character's gender is apparent from the source text or widely known character identity, include male or female in that character description. Use unknown when it is not apparent.",
  'Include a generic character named "Narrator" for all source text that is not spoken by or directly attributed to a named character.',
  'Narrator is a role, not a male or female character. Always describe Narrator as narrator and never assign it a gender.',
  "Return the source text as an ordered turn-by-turn script.",
  "A turn is one contiguous span of source text spoken by one character or narrated by Narrator.",
  'Use "Narrator" for every unattributed narrative span, including narration that appears between dialogue turns.',
  'Use "Narrator" for dialogue attribution and action tags such as "said", "asked", "replied", "se rio", or "preguntó", unless those words are inside the spoken dialogue.',
  "When narration and dialogue appear in the same paragraph or sentence, split them into separate turns while preserving the original order.",
  "Do not group non-contiguous text from the same character into one turn.",
  "Every part of the source text must appear exactly once across turns[].text, in original order.",
  "Copy turn text exactly from the source text. Do not summarize, paraphrase, translate, or add new wording.",
  'Do not invent characters other than the generic "Narrator" character for unattributed text.',
  'If no distinct speaking characters are present, return only the "Narrator" character and one turn containing the full source text.',
  "The order fields must start at 1 and increment by 1 in source text order.",
  'Escape all newlines in JSON strings as "\\n". Escape double quotes inside strings. Do not use raw multiline JSON strings.',
  "Do not wrap the JSON in markdown fences.",
  "Return only valid JSON with this exact shape:",
  '{"language":{"code":"ISO 639-1 code or und","name":"language name"},"characters":[{"name":"character name","description":"short role or voice-relevant description including apparent gender"}],"turns":[{"order":1,"characterName":"character name or Narrator","text":"exact original contiguous source text for this turn"}]}',
].join("\n");

class InvalidAiJsonError extends Error {
  constructor(message = "AI response was not valid JSON.") {
    super(message);
    this.name = "InvalidAiJsonError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sourceTextValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseJsonObject(response: string) {
  try {
    return JSON.parse(response) as unknown;
  } catch (directError) {
    const start = response.indexOf("{");
    const end = response.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new InvalidAiJsonError();
    }

    try {
      return JSON.parse(response.slice(start, end + 1)) as unknown;
    } catch (slicedError) {
      const error =
        slicedError instanceof Error
          ? slicedError
          : directError instanceof Error
            ? directError
            : null;

      throw new InvalidAiJsonError(
        error
          ? `AI response was not valid JSON: ${error.message}`
          : "AI response was not valid JSON.",
      );
    }
  }
}

function normalizeCharacters(value: unknown): AudioCharacterAnalysis[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((character) => {
      if (!isRecord(character)) {
        return null;
      }

      const name = stringValue(character.name);

      if (!name) {
        return null;
      }

      return {
        name,
        description: stringValue(character.description),
      };
    })
    .filter((character): character is AudioCharacterAnalysis =>
      Boolean(character),
    );
}

function normalizeTurns(value: unknown): AudioTextTurnAnalysis[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((turn, index) => {
      if (!isRecord(turn)) {
        return null;
      }

      const characterName = stringValue(turn.characterName);
      const text = sourceTextValue(turn.text);

      if (!characterName || !text.trim()) {
        return null;
      }

      const order =
        typeof turn.order === "number" && Number.isInteger(turn.order)
          ? turn.order
          : index + 1;

      return {
        order,
        characterName,
        text,
      };
    })
    .filter((turn): turn is AudioTextTurnAnalysis => Boolean(turn))
    .sort((a, b) => a.order - b.order)
    .map((turn, index) => ({
      ...turn,
      order: index + 1,
    }));
}

function normalizeAnalysis(response: string): AudioTextAnalysisResult {
  const parsed = parseJsonObject(response);

  if (!isRecord(parsed) || !isRecord(parsed.language)) {
    throw new InvalidAiJsonError("AI response did not include language metadata.");
  }

  const turns = normalizeTurns(parsed.turns);

  if (turns.length === 0) {
    throw new InvalidAiJsonError("AI response did not include ordered turns.");
  }

  return {
    languageCode: stringValue(parsed.language.code) || "und",
    languageName: stringValue(parsed.language.name) || "Unknown",
    characters: normalizeCharacters(parsed.characters),
    turns,
  };
}

function getAnalysisMaxOutputTokens(text: string) {
  return Math.min(
    MAX_ANALYSIS_OUTPUT_TOKENS,
    Math.max(MIN_ANALYSIS_OUTPUT_TOKENS, Math.ceil(text.length / 2) + 1200),
  );
}

function isRequestOptionError(error: unknown) {
  if (error instanceof LlmRequestError) {
    return error.status === 400 || error.status === 422;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("LLM request failed: 400") ||
    error.message.includes("LLM request failed: 422")
  );
}

async function askAiForAnalysis(text: string, retryReason?: string) {
  const userContent = retryReason
    ? [
        retryReason,
        "Analyze the same source text again and return valid JSON only.",
        "Every string value must be JSON-escaped, especially text containing newlines or quotation marks.",
        `Source text:\n\n${text}`,
      ].join("\n\n")
    : `Analyze this text:\n\n${text}`;
  const messages = [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    {
      role: "user" as const,
      content: userContent,
    },
  ];
  const maxOutputTokens = getAnalysisMaxOutputTokens(text);

  try {
    return await askAi({
      messages,
      maxOutputTokens,
      responseFormat: "json_object",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";

    if (
      isRequestOptionError(error) ||
      errorMessage.includes("response_format") ||
      errorMessage.includes("response format")
    ) {
      return askAi({
        messages,
        maxOutputTokens,
      });
    }

    throw error;
  }
}

export async function analyzeTextForAudio(
  text: string,
): Promise<AudioTextAnalysisResult> {
  const response = await askAiForAnalysis(text);

  try {
    return normalizeAnalysis(response);
  } catch (error) {
    if (!(error instanceof InvalidAiJsonError)) {
      throw error;
    }

    const retryResponse = await askAiForAnalysis(text, error.message);

    return normalizeAnalysis(retryResponse);
  }
}
