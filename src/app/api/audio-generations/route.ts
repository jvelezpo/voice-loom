import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  analyzeTextForAudio,
  type AudioCharacterAnalysis,
  type AudioTextAnalysisResult,
  type AudioTextTurnAnalysis,
} from "@/util/analyzeTextForAudio";
import { AI_DIALOGUE_VOICE_KEY, TEXT_TO_SPEECH_MODEL, VOICES } from "@/util/constant";
import { generateMultiSpeakerSpeech } from "@/util/generateSpeech";

type VoiceKey = keyof typeof VOICES;
type VoiceGender = "female" | "male" | "unknown";

type StoredAudioTextAnalysis = {
  languageCode: string;
  languageName: string;
  charactersJson: string;
};

type CharacterVoiceAssignment = {
  characterName: string;
  voiceKey: VoiceKey;
  referenceId: string;
  speakerIndex: number;
};

const voiceKeys = Object.keys(VOICES) as VoiceKey[];

function getTextEntryId(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const value = (body as { textEntryId?: unknown }).textEntryId;
  const textEntryId = typeof value === "number" ? value : Number(value);

  return Number.isInteger(textEntryId) ? textEntryId : null;
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

function parseStoredAnalysis(
  audioAnalysis: StoredAudioTextAnalysis,
): AudioTextAnalysisResult | null {
  try {
    const parsed = JSON.parse(audioAnalysis.charactersJson) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const turns = normalizeTurns(parsed.turns);

    if (turns.length === 0) {
      return null;
    }

    return {
      languageCode: audioAnalysis.languageCode,
      languageName: audioAnalysis.languageName,
      characters: normalizeCharacters(parsed.characters),
      turns,
    };
  } catch {
    return null;
  }
}

function serializeAnalysis(analysis: AudioTextAnalysisResult) {
  return JSON.stringify({
    characters: analysis.characters,
    turns: analysis.turns,
  });
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getVoiceAlias(voiceKey: VoiceKey) {
  return voiceKey.split("_").slice(3).join(" ");
}

function isNarratorVoice(voiceKey: VoiceKey) {
  return (
    normalizeName(voiceKey) === "narrator" ||
    normalizeName(getVoiceAlias(voiceKey)) === "narrator"
  );
}

function getVoiceGender(voiceKey: VoiceKey): VoiceGender {
  if (voiceKey.includes("_female_")) {
    return "female";
  }

  if (voiceKey.includes("_male_")) {
    return "male";
  }

  return "unknown";
}

function inferCharacterGender(character: AudioCharacterAnalysis | undefined) {
  if (!character) {
    return "unknown";
  }

  const text = normalizeName(`${character.name} ${character.description}`);
  const words = new Set(text.split(" ").filter(Boolean));
  const femaleWords = [
    "female",
    "woman",
    "girl",
    "mother",
    "daughter",
    "sister",
    "wife",
    "queen",
    "princess",
    "mujer",
    "femenina",
    "nina",
    "chica",
    "madre",
    "hija",
    "hermana",
    "esposa",
    "reina",
    "princesa",
    "senora",
    "bulma",
    "milk",
    "chichi",
    "chi",
  ];
  const maleWords = [
    "male",
    "man",
    "boy",
    "father",
    "son",
    "brother",
    "husband",
    "king",
    "prince",
    "hombre",
    "masculino",
    "nino",
    "chico",
    "padre",
    "hijo",
    "hermano",
    "esposo",
    "rey",
    "principe",
    "senor",
    "goku",
    "vegeta",
    "trunks",
  ];

  if (femaleWords.some((word) => words.has(word))) {
    return "female";
  }

  if (maleWords.some((word) => words.has(word))) {
    return "male";
  }

  return "unknown";
}

function getAvailableVoiceKeys(
  candidates: VoiceKey[],
  usedVoiceKeys: Set<VoiceKey>,
) {
  const unusedCandidates = candidates.filter(
    (voiceKey) => !usedVoiceKeys.has(voiceKey),
  );

  return unusedCandidates.length > 0 ? unusedCandidates : candidates;
}

function getTurnCharacterNames(turns: AudioTextTurnAnalysis[]) {
  const characterNames: string[] = [];

  for (const turn of turns) {
    if (!characterNames.includes(turn.characterName)) {
      characterNames.push(turn.characterName);
    }
  }

  return characterNames;
}

function assignCharacterVoices(
  characters: AudioCharacterAnalysis[],
  turns: AudioTextTurnAnalysis[],
): CharacterVoiceAssignment[] {
  if (voiceKeys.length === 0) {
    return [];
  }

  const narratorVoiceKey =
    voiceKeys.find(isNarratorVoice) ??
    voiceKeys[0];
  const characterVoiceKeys = voiceKeys.filter(
    (voiceKey) => !isNarratorVoice(voiceKey),
  );
  const femaleVoiceKeys = characterVoiceKeys.filter(
    (voiceKey) => getVoiceGender(voiceKey) === "female",
  );
  const maleVoiceKeys = characterVoiceKeys.filter(
    (voiceKey) => getVoiceGender(voiceKey) === "male",
  );
  const characterByName = new Map(
    characters.map((character) => [normalizeName(character.name), character]),
  );
  const usedVoiceKeys = new Set<VoiceKey>();
  const fallbackIndexes = {
    female: 0,
    male: 0,
    unknown: 0,
  };

  return getTurnCharacterNames(turns).map((characterName, speakerIndex) => {
    const normalizedCharacterName = normalizeName(characterName);
    const character = characterByName.get(normalizedCharacterName);
    const characterGender = inferCharacterGender(
      character ?? {
        name: characterName,
        description: "",
      },
    );
    let voiceKey: VoiceKey | undefined;

    if (normalizedCharacterName === "narrator") {
      voiceKey = narratorVoiceKey;
    } else {
      voiceKey = characterVoiceKeys.find((candidateVoiceKey) => {
        const voiceAlias = normalizeName(getVoiceAlias(candidateVoiceKey));
        const voiceGender = getVoiceGender(candidateVoiceKey);

        return (
          !usedVoiceKeys.has(candidateVoiceKey) &&
          (characterGender === "unknown" || voiceGender === characterGender) &&
          voiceAlias.length > 0 &&
          normalizedCharacterName.includes(voiceAlias)
        );
      });
    }

    if (!voiceKey) {
      const genderVoiceKeys =
        characterGender === "female"
          ? femaleVoiceKeys
          : characterGender === "male"
            ? maleVoiceKeys
            : characterVoiceKeys;
      const fallbackVoiceKeys =
        genderVoiceKeys.length > 0
          ? genderVoiceKeys
          : characterVoiceKeys;

      if (fallbackVoiceKeys.length === 0) {
        throw new Error("No non-narrator character voices are available.");
      }

      const availableVoiceKeys = getAvailableVoiceKeys(
        fallbackVoiceKeys,
        usedVoiceKeys,
      );
      const fallbackIndex = fallbackIndexes[characterGender];

      voiceKey = availableVoiceKeys[fallbackIndex % availableVoiceKeys.length];
      fallbackIndexes[characterGender] = fallbackIndex + 1;
    }

    usedVoiceKeys.add(voiceKey);

    return {
      characterName,
      voiceKey,
      referenceId: VOICES[voiceKey],
      speakerIndex,
    };
  });
}

function buildMultiSpeakerText(
  turns: AudioTextTurnAnalysis[],
  assignments: CharacterVoiceAssignment[],
) {
  const speakerIndexByCharacterName = new Map(
    assignments.map((assignment) => [
      assignment.characterName,
      assignment.speakerIndex,
    ]),
  );

  return turns
    .map((turn) => {
      const speakerIndex = speakerIndexByCharacterName.get(turn.characterName);

      return `<|speaker:${speakerIndex ?? 0}|>${turn.text}`;
    })
    .join("\n");
}

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "AI audio generation failed. Please try again.";
  }

  if (
    error.message.includes("configured") ||
    error.message.startsWith("Missing ")
  ) {
    return error.message;
  }

  return "AI audio generation failed. Please try again.";
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "Send a valid JSON request." },
      { status: 400 },
    );
  }

  const textEntryId = getTextEntryId(body);

  if (!textEntryId) {
    return Response.json(
      { message: "Choose a valid text before generating audio." },
      { status: 400 },
    );
  }

  const entry = await prisma.textEntry.findUnique({
    where: {
      id: textEntryId,
    },
    select: {
      id: true,
      content: true,
      audioAnalysis: {
        select: {
          languageCode: true,
          languageName: true,
          charactersJson: true,
        },
      },
    },
  });

  if (!entry) {
    return Response.json(
      { message: "The selected text no longer exists." },
      { status: 404 },
    );
  }

  try {
    let analysis = entry.audioAnalysis
      ? parseStoredAnalysis(entry.audioAnalysis)
      : null;

    if (!analysis) {
      const analysisStartedAt = Date.now();

      console.log(
        `[audio-generations] Starting AI text analysis textEntryId=${textEntryId}`,
      );

      analysis = await analyzeTextForAudio(entry.content);

      console.log(
        [
          "[audio-generations] Finished AI text analysis",
          `textEntryId=${textEntryId}`,
          `durationMs=${Date.now() - analysisStartedAt}`,
          `languageCode=${analysis.languageCode}`,
          `charactersCount=${analysis.characters.length}`,
          `turnsCount=${analysis.turns.length}`,
        ].join(" "),
      );

      await prisma.audioTextAnalysis.upsert({
        where: {
          textEntryId,
        },
        update: {
          languageCode: analysis.languageCode,
          languageName: analysis.languageName,
          charactersJson: serializeAnalysis(analysis),
        },
        create: {
          textEntryId,
          languageCode: analysis.languageCode,
          languageName: analysis.languageName,
          charactersJson: serializeAnalysis(analysis),
        },
      });
    }

    const voiceAssignments = assignCharacterVoices(
      analysis.characters,
      analysis.turns,
    );
    const speakerText = buildMultiSpeakerText(analysis.turns, voiceAssignments);
    const existingAiAudio = await prisma.audioGeneration.findUnique({
      where: {
        textEntryId_voiceKey: {
          textEntryId,
          voiceKey: AI_DIALOGUE_VOICE_KEY,
        },
      },
    });

    await prisma.audioTextAnalysis.update({
      where: {
        textEntryId,
      },
      data: {
        fishAudioText: speakerText,
      },
    });

    const generationStartedAt = Date.now();

    console.log(
      [
        "[audio-generations] Starting Fish multi-speaker TTS",
        `textEntryId=${textEntryId}`,
        `charactersCount=${voiceAssignments.length}`,
        `turnsCount=${analysis.turns.length}`,
      ].join(" "),
    );

    const filePath = await generateMultiSpeakerSpeech({
      text: speakerText,
      referenceIds: voiceAssignments.map((assignment) => assignment.referenceId),
      outputFileName: `text-${textEntryId}-ai-dialogue`,
    });

    console.log(
      [
        "[audio-generations] Finished Fish multi-speaker TTS",
        `textEntryId=${textEntryId}`,
        `durationMs=${Date.now() - generationStartedAt}`,
      ].join(" "),
    );

    const audioGeneration = await prisma.audioGeneration.upsert({
      where: {
        textEntryId_voiceKey: {
          textEntryId,
          voiceKey: AI_DIALOGUE_VOICE_KEY,
        },
      },
      update: {
        referenceId: JSON.stringify({
          model: TEXT_TO_SPEECH_MODEL,
          voiceAssignments,
        }),
        filePath,
        createdAt: new Date(),
      },
      create: {
        textEntryId,
        voiceKey: AI_DIALOGUE_VOICE_KEY,
        referenceId: JSON.stringify({
          model: TEXT_TO_SPEECH_MODEL,
          voiceAssignments,
        }),
        filePath,
      },
    });

    revalidatePath(`/texts/${textEntryId}`);

    return Response.json(
      {
        status: existingAiAudio ? "updated" : "created",
        message: existingAiAudio
          ? "AI audio regenerated."
          : "AI audio generated.",
        audioGenerationId: audioGeneration.id,
        analysis,
        voiceAssignments,
      },
      { status: existingAiAudio ? 200 : 201 },
    );
  } catch (error) {
    console.error(
      `[audio-generations] AI audio generation failed textEntryId=${textEntryId}`,
      error,
    );

    return Response.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
