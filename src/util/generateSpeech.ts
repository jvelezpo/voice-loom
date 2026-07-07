import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { TEXT_TO_SPEECH_MODEL } from "./constant"

type GenerateSpeechParams = {
  text: string;
  reference_id: string;
  outputFileName: string;
};

type GenerateMultiSpeakerSpeechParams = {
  text: string;
  referenceIds: string[];
  outputFileName: string;
};

type FishTtsBody = {
  text: string;
  reference_id: string | string[];
  format: "mp3";
  mp3_bitrate: 128;
  latency: "normal";
};

const audioDirectory = join(process.cwd(), ".data", "generated-audio");
const fishTtsModel = TEXT_TO_SPEECH_MODEL;

function toSafeMp3FileName(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "-");

  return safeName.endsWith(".mp3") ? safeName : `${safeName}.mp3`;
}

async function requestSpeech(body: FishTtsBody) {
  const apiKey = process.env.FISH_API_KEY;

  if (!apiKey) {
    throw new Error("FISH_API_KEY is not configured.");
  }

  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: fishTtsModel,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`TTS request failed: ${res.status} ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function writeGeneratedSpeech(outputFileName: string, buffer: Buffer) {
  const fileName = toSafeMp3FileName(outputFileName);
  const filePath = join(audioDirectory, fileName);
  const storedPath = `generated-audio/${fileName}`;

  await mkdir(audioDirectory, { recursive: true });
  await writeFile(filePath, buffer);

  return storedPath;
}

export async function generateSpeech({
  text,
  reference_id,
  outputFileName,
}: GenerateSpeechParams) {
  const buffer = await requestSpeech({
    text,
    reference_id,
    format: "mp3",
    mp3_bitrate: 128,
    latency: "normal",
  });

  return writeGeneratedSpeech(outputFileName, buffer);
}

export async function generateMultiSpeakerSpeech({
  text,
  referenceIds,
  outputFileName,
}: GenerateMultiSpeakerSpeechParams) {
  if (referenceIds.length === 0) {
    throw new Error("No Fish Audio voices are available.");
  }

  const buffer = await requestSpeech({
    text,
    reference_id: referenceIds,
    format: "mp3",
    mp3_bitrate: 128,
    latency: "normal",
  });

  return writeGeneratedSpeech(outputFileName, buffer);
}
