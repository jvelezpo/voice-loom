import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  analyzeTextForAudio,
  type AudioCharacterAnalysis,
  type AudioTextAnalysisResult,
  type AudioTextTurnAnalysis,
} from "@/util/analyzeTextForAudio";
import { AI_DIALOGUE_VOICE_KEY, TEXT_TO_SPEECH_MODEL, VOICES } from "@/util/constant";
import {
  getFishVoiceModelCandidates,
  type FishVoiceModelCandidate,
} from "@/util/fishVoiceModels";
import { generateMultiSpeakerSpeech } from "@/util/generateSpeech";

type VoiceGender = "female" | "male" | "unknown";

type StoredAudioTextAnalysis = {
  languageCode: string;
  languageName: string;
  charactersJson: string;
};

type CharacterVoiceAssignment = {
  characterName: string;
  voiceKey: string;
  referenceId: string;
  speakerIndex: number;
  gender: VoiceGender;
};

const MAX_MULTI_SPEAKER_VOICES = 4;

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

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
) {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
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
        gender: enumValue(
          character.gender,
          ["female", "male", "unknown"] as const,
          "unknown",
        ),
        age: enumValue(
          character.age,
          ["child", "young_adult", "adult", "senior", "unknown"] as const,
          "unknown",
        ),
        tone: stringValue(character.tone) || "neutral",
        energy: enumValue(
          character.energy,
          ["low", "medium", "high", "unknown"] as const,
          "unknown",
        ),
        role: enumValue(
          character.role,
          ["narrator", "character"] as const,
          name.toLowerCase() === "narrator" ? "narrator" : "character",
        ),
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

function getCharacterGender(character: AudioCharacterAnalysis | undefined) {
  if (!character) {
    return "unknown";
  }

  if (character.gender !== "unknown") {
    return character.gender;
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

function getTurnCharacterNames(turns: AudioTextTurnAnalysis[]) {
  const characterNames: string[] = [];

  for (const turn of turns) {
    if (!characterNames.includes(turn.characterName)) {
      characterNames.push(turn.characterName);
    }
  }

  return characterNames;
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function scoreSpanishRegion(metadata: string, languageCode: string) {
  if (!languageCode.toLowerCase().startsWith("es")) {
    return 0;
  }

  const latinAmericanTerms = [
    "latam",
    "latin american",
    "latinoamericano",
    "latinoamericana",
    "mexico",
    "mexican",
    "colombia",
    "colombian",
    "argentina",
    "argentinian",
    "chile",
    "chilean",
    "peru",
    "peruvian",
    "venezuela",
    "venezuelan",
  ];
  const spainTerms = [
    "castilian",
    "castellano",
    "castellana",
    "spanish from spain",
    "espanol de espana",
    "spain",
  ];

  if (includesAny(metadata, latinAmericanTerms)) {
    return 35;
  }

  if (includesAny(metadata, spainTerms)) {
    return -25;
  }

  return 0;
}

function getCandidateGender(candidate: FishVoiceModelCandidate): VoiceGender {
  const text = normalizeName(
    [candidate.title, candidate.description, ...candidate.tags].join(" "),
  );

  if (includesAny(text, ["female", "woman", "girl", "mujer", "femenina"])) {
    return "female";
  }

  if (includesAny(text, ["male", " man ", "boy", "hombre", "masculina"])) {
    return "male";
  }

  return "unknown";
}

function scoreCandidate(
  candidate: FishVoiceModelCandidate,
  character: AudioCharacterAnalysis,
  languageCode: string,
  usedReferenceIds: Set<string>,
) {
  const metadata = normalizeName(
    [candidate.title, candidate.description, ...candidate.tags].join(" "),
  );
  const characterGender = getCharacterGender(character);
  const candidateGender = getCandidateGender(candidate);
  let score =
    Math.log10(candidate.taskCount + 1) +
    scoreSpanishRegion(metadata, languageCode);

  if (
    candidate.languages.some(
      (language) => language.toLowerCase() === languageCode.toLowerCase(),
    )
  ) {
    score += 30;
  }

  if (characterGender !== "unknown") {
    score += candidateGender === characterGender ? 25 : 0;
    score -=
      candidateGender !== "unknown" && candidateGender !== characterGender
        ? 40
        : 0;
  }

  if (character.age !== "unknown") {
    const ageTerms: Record<AudioCharacterAnalysis["age"], string[]> = {
      child: ["child", "kid", "young", "nino", "nina"],
      young_adult: ["young adult", "young", "joven"],
      adult: ["adult", "middle aged", "mature", "adulto", "adulta"],
      senior: ["senior", "elder", "old", "older", "anciano", "anciana"],
      unknown: [],
    };

    if (includesAny(metadata, ageTerms[character.age])) {
      score += 15;
    }
  }

  for (const tone of normalizeName(character.tone).split(" ").filter(Boolean)) {
    if (metadata.includes(tone)) {
      score += 4;
    }
  }

  if (character.energy !== "unknown" && metadata.includes(character.energy)) {
    score += 8;
  }

  if (usedReferenceIds.has(candidate.referenceId)) {
    score -= 20;
  }

  return score;
}

function getFallbackCharacterVoices(): FishVoiceModelCandidate[] {
  return Object.entries(VOICES)
    .filter(([voiceKey]) => voiceKey !== "narrator")
    .map(([voiceKey, referenceId]) => ({
      referenceId,
      title: voiceKey,
      description: voiceKey.replaceAll("_", " "),
      tags: [],
      languages: voiceKey.startsWith("es_") ? ["es"] : [],
      taskCount: 0,
    }));
}

function assignCharacterVoices(
  characters: AudioCharacterAnalysis[],
  turns: AudioTextTurnAnalysis[],
  languageCode: string,
  candidates: FishVoiceModelCandidate[],
): CharacterVoiceAssignment[] {
  const characterByName = new Map(
    characters.map((character) => [normalizeName(character.name), character]),
  );
  const usedReferenceIds = new Set<string>();
  const discoveredCandidates = candidates.filter(
    (candidate) => candidate.referenceId !== VOICES.narrator,
  );
  const availableCandidates =
    discoveredCandidates.length > 0
      ? discoveredCandidates
      : getFallbackCharacterVoices();

  return getTurnCharacterNames(turns).map((characterName, speakerIndex) => {
    const normalizedCharacterName = normalizeName(characterName);
    const character = characterByName.get(normalizedCharacterName) ?? {
      name: characterName,
      description: "",
      gender: "unknown" as const,
      age: "unknown" as const,
      tone: "neutral",
      energy: "unknown" as const,
      role: normalizedCharacterName === "narrator" ? "narrator" as const : "character" as const,
    };

    if (character.role === "narrator" || normalizedCharacterName === "narrator") {
      usedReferenceIds.add(VOICES.narrator);

      return {
        characterName,
        voiceKey: "narrator",
        referenceId: VOICES.narrator,
        speakerIndex,
        gender: "unknown",
      };
    }

    const selectedCandidate = [...availableCandidates].sort(
      (left, right) =>
        scoreCandidate(right, character, languageCode, usedReferenceIds) -
        scoreCandidate(left, character, languageCode, usedReferenceIds),
    )[0];

    usedReferenceIds.add(selectedCandidate.referenceId);

    return {
      characterName,
      voiceKey: selectedCandidate.title,
      referenceId: selectedCandidate.referenceId,
      speakerIndex,
      gender: getCharacterGender(character),
    };
  });
}

function limitMultiSpeakerVoices(
  assignments: CharacterVoiceAssignment[],
) {
  const availableAssignments = assignments.slice(
    0,
    MAX_MULTI_SPEAKER_VOICES,
  );

  return assignments.map((assignment, index) => {
    if (index < MAX_MULTI_SPEAKER_VOICES) {
      return assignment;
    }

    const assignmentGender = assignment.gender;
    const compatibleAssignments = availableAssignments.filter(
      (availableAssignment) =>
        availableAssignment.voiceKey !== "narrator" &&
        availableAssignment.gender === assignmentGender,
    );
    const fallbackAssignments = availableAssignments.filter(
      (availableAssignment) => availableAssignment.voiceKey !== "narrator",
    );
    const reusableAssignments =
      compatibleAssignments.length > 0
        ? compatibleAssignments
        : fallbackAssignments.length > 0
          ? fallbackAssignments
          : availableAssignments;
    const reusableAssignment =
      reusableAssignments[
        (index - MAX_MULTI_SPEAKER_VOICES) % reusableAssignments.length
      ];

    return {
      ...assignment,
      voiceKey: reusableAssignment.voiceKey,
      referenceId: reusableAssignment.referenceId,
      speakerIndex: reusableAssignment.speakerIndex,
    };
  });
}

function getReferenceIds(assignments: CharacterVoiceAssignment[]) {
  const referenceIds: string[] = [];

  for (const assignment of assignments) {
    referenceIds[assignment.speakerIndex] = assignment.referenceId;
  }

  return referenceIds;
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

    let voiceCandidates: FishVoiceModelCandidate[] = [];

    try {
      voiceCandidates = await getFishVoiceModelCandidates(
        analysis.languageCode,
      );
    } catch (error) {
      console.warn(
        `[audio-generations] Fish voice discovery failed; using configured fallback voices textEntryId=${textEntryId}`,
        error,
      );
    }

    const voiceAssignments = limitMultiSpeakerVoices(
      assignCharacterVoices(
        analysis.characters,
        analysis.turns,
        analysis.languageCode,
        voiceCandidates,
      ),
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
      referenceIds: getReferenceIds(voiceAssignments),
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
