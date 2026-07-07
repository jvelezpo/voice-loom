"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VOICES } from "@/util/constant";
import { generateSpeech } from "@/util/generateSpeech";

export type GenerateAudioState = {
  status: "idle" | "created" | "exists" | "error";
  message: string;
  audioGenerationId?: number;
};

const voiceKeys = Object.keys(VOICES) as Array<keyof typeof VOICES>;

function isVoiceKey(value: string): value is keyof typeof VOICES {
  return voiceKeys.includes(value as keyof typeof VOICES);
}

export async function createTextEntry(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return;
  }

  await prisma.textEntry.create({
    data: {
      content,
    },
  });

  revalidatePath("/");
}

export async function generateAudioForText(
  prevState: GenerateAudioState,
  formData: FormData,
): Promise<GenerateAudioState> {
  void prevState;

  const textEntryId = Number(formData.get("textEntryId"));
  const voiceKey = String(formData.get("voiceKey") ?? "");

  if (!Number.isInteger(textEntryId) || !isVoiceKey(voiceKey)) {
    return {
      status: "error",
      message: "Choose a valid text and voice before generating audio.",
    };
  }

  const existingAudio = await prisma.audioGeneration.findUnique({
    where: {
      textEntryId_voiceKey: {
        textEntryId,
        voiceKey,
      },
    },
  });

  if (existingAudio) {
    revalidatePath(`/texts/${textEntryId}`);

    return {
      status: "exists",
      message: "Audio with this voice already exists. Highlighted below.",
      audioGenerationId: existingAudio.id,
    };
  }

  const entry = await prisma.textEntry.findUnique({
    where: {
      id: textEntryId,
    },
  });

  if (!entry) {
    return {
      status: "error",
      message: "The selected text no longer exists.",
    };
  }

  try {
    const filePath = await generateSpeech({
      text: entry.content,
      reference_id: VOICES[voiceKey],
      outputFileName: `text-${textEntryId}-${voiceKey}`,
    });

    const audioGeneration = await prisma.audioGeneration.create({
      data: {
        textEntryId,
        voiceKey,
        referenceId: VOICES[voiceKey],
        filePath,
      },
    });

    revalidatePath(`/texts/${textEntryId}`);

    return {
      status: "created",
      message: "Audio generated successfully.",
      audioGenerationId: audioGeneration.id,
    };
  } catch (error) {
    console.log('=============================');
    console.log(error);
    console.log('=============================');
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingAudioAfterRace = await prisma.audioGeneration.findUnique({
        where: {
          textEntryId_voiceKey: {
            textEntryId,
            voiceKey,
          },
        },
      });

      if (existingAudioAfterRace) {
        revalidatePath(`/texts/${textEntryId}`);

        return {
          status: "exists",
          message: "Audio with this voice already exists. Highlighted below.",
          audioGenerationId: existingAudioAfterRace.id,
        };
      }
    }

    return {
      status: "error",
      message: "Audio generation failed. Please try again.",
    };
  }
}
