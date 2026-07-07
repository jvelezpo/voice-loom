import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

type GenerateSpeechParams = {
  text: string;
  reference_id: string;
  outputFileName: string;
};

const audioDirectory = join(process.cwd(), ".data", "generated-audio");

function toSafeMp3FileName(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "-");

  return safeName.endsWith(".mp3") ? safeName : `${safeName}.mp3`;
}

export async function generateSpeech({
  text,
  reference_id,
  outputFileName,
}: GenerateSpeechParams) {
  const apiKey = process.env.FISH_API_KEY;

  if (!apiKey) {
    throw new Error("FISH_API_KEY is not configured.");
  }

  const body = {
    text,
    reference_id,
    format: "mp3",
  };

  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`TTS request failed: ${res.status} ${await res.text()}`);
  }

  const fileName = toSafeMp3FileName(outputFileName);
  const filePath = join(audioDirectory, fileName);
  const storedPath = `generated-audio/${fileName}`;
  const buffer = Buffer.from(await res.arrayBuffer());

  await mkdir(audioDirectory, { recursive: true });
  await writeFile(filePath, buffer);

  return storedPath;
}
