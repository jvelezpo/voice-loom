import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AI_DIALOGUE_VOICE_KEY, VOICES } from "@/util/constant";
import { AudioGenerations } from "./audio-generations";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

type AudioAnalysisCharacter = {
  name: string;
  description: string;
};

type AudioAnalysisTurn = {
  order: number;
  characterName: string;
  text: string;
};

type ParsedAudioAnalysisJson = {
  characters: AudioAnalysisCharacter[];
  turns: AudioAnalysisTurn[];
};

type AiVoiceAssignment = {
  characterName: string;
  voiceKey: string;
  speakerIndex: number;
};

function getVoiceLabel(voiceKey: string) {
  return voiceKey
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const voiceOptions = (Object.keys(VOICES) as Array<keyof typeof VOICES>).map(
  (key) => ({
    key,
    label: getVoiceLabel(key),
  }),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAudioAnalysisCharacter(
  value: unknown,
): value is AudioAnalysisCharacter {
  return (
    isRecord(value) &&
    "name" in value &&
    typeof value.name === "string" &&
    "description" in value &&
    typeof value.description === "string"
  );
}

function isAudioAnalysisTurn(value: unknown): value is AudioAnalysisTurn {
  return (
    isRecord(value) &&
    "order" in value &&
    typeof value.order === "number" &&
    Number.isInteger(value.order) &&
    "characterName" in value &&
    typeof value.characterName === "string" &&
    "text" in value &&
    typeof value.text === "string"
  );
}

function normalizeTurns(turns: AudioAnalysisTurn[]) {
  return turns
    .sort((a, b) => a.order - b.order)
    .map((turn, index) => ({
      ...turn,
      order: index + 1,
    }));
}

function isAiVoiceAssignment(value: unknown): value is AiVoiceAssignment {
  return (
    isRecord(value) &&
    "characterName" in value &&
    typeof value.characterName === "string" &&
    "voiceKey" in value &&
    typeof value.voiceKey === "string" &&
    "speakerIndex" in value &&
    typeof value.speakerIndex === "number" &&
    Number.isInteger(value.speakerIndex)
  );
}

function parseCharactersJson(charactersJson: string): ParsedAudioAnalysisJson {
  try {
    const value = JSON.parse(charactersJson) as unknown;

    if (Array.isArray(value)) {
      return {
        characters: value.filter(isAudioAnalysisCharacter),
        turns: [],
      };
    }

    if (isRecord(value)) {
      return {
        characters: Array.isArray(value.characters)
          ? value.characters.filter(isAudioAnalysisCharacter)
          : [],
        turns: Array.isArray(value.turns)
          ? normalizeTurns(value.turns.filter(isAudioAnalysisTurn))
          : [],
      };
    }
  } catch {
    return {
      characters: [],
      turns: [],
    };
  }

  return {
    characters: [],
    turns: [],
  };
}

function parseAiVoiceAssignments(referenceId: string): AiVoiceAssignment[] {
  try {
    const value = JSON.parse(referenceId) as unknown;

    if (!isRecord(value) || !Array.isArray(value.voiceAssignments)) {
      return [];
    }

    return value.voiceAssignments.filter(isAiVoiceAssignment);
  } catch {
    return [];
  }
}

export default async function TextEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entryId = Number(id);

  if (!Number.isInteger(entryId)) {
    notFound();
  }

  const entry = await prisma.textEntry.findUnique({
    where: {
      id: entryId,
    },
    include: {
      audioAnalysis: true,
      audioGenerations: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!entry) {
    notFound();
  }

  const parsedAudioAnalysis = entry.audioAnalysis
    ? parseCharactersJson(entry.audioAnalysis.charactersJson)
    : null;
  const audioGenerationItems = entry.audioGenerations.map((audioGeneration) => ({
    id: audioGeneration.id,
    voiceKey: audioGeneration.voiceKey,
    voiceLabel:
      audioGeneration.voiceKey === AI_DIALOGUE_VOICE_KEY
        ? "Multi-character dialogue"
        : getVoiceLabel(audioGeneration.voiceKey),
    voiceAssignments:
      audioGeneration.voiceKey === AI_DIALOGUE_VOICE_KEY
        ? parseAiVoiceAssignments(audioGeneration.referenceId)
        : [],
    createdAt: audioGeneration.createdAt.toISOString(),
    createdAtLabel: dateFormatter.format(audioGeneration.createdAt),
  }));
  const aiAudioGenerations = audioGenerationItems.filter(
    (audioGeneration) => audioGeneration.voiceKey === AI_DIALOGUE_VOICE_KEY,
  );
  const manualAudioGenerations = audioGenerationItems.filter(
    (audioGeneration) => audioGeneration.voiceKey !== AI_DIALOGUE_VOICE_KEY,
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Link
          href="/"
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          Back to saved texts
        </Link>

        <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">
          <header className="mb-6 flex flex-col gap-2 border-b border-zinc-200 pb-5">
            <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
              Saved text
            </p>
            <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
              Text #{entry.id}
            </h1>
            <time
              dateTime={entry.createdAt.toISOString()}
              className="text-sm text-zinc-500"
            >
              {dateFormatter.format(entry.createdAt)}
            </time>
          </header>

          <p className="whitespace-pre-wrap text-base leading-7 text-zinc-800">
            {entry.content}
          </p>

          <AudioGenerations
            textEntryId={entry.id}
            voiceOptions={voiceOptions}
            aiAudioGenerations={aiAudioGenerations}
            audioGenerations={manualAudioGenerations}
            audioAnalysis={
              entry.audioAnalysis
                ? {
                    languageCode: entry.audioAnalysis.languageCode,
                    languageName: entry.audioAnalysis.languageName,
                    characters: parsedAudioAnalysis?.characters ?? [],
                    turns: parsedAudioAnalysis?.turns ?? [],
                    updatedAt: entry.audioAnalysis.updatedAt.toISOString(),
                    updatedAtLabel: dateFormatter.format(
                      entry.audioAnalysis.updatedAt,
                    ),
                  }
                : null
            }
          />
        </article>
      </div>
    </main>
  );
}
