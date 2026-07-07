import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { basename, join, resolve } from "path";
import { Readable } from "stream";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

const audioDirectory = resolve(process.cwd(), ".data", "generated-audio");

function getPrivateAudioPath(storedPath: string) {
  const fileName = basename(storedPath);
  const audioPath = resolve(join(audioDirectory, fileName));

  if (!audioPath.startsWith(`${audioDirectory}/`)) {
    notFound();
  }

  return audioPath;
}

function getRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader?.startsWith("bytes=")) {
    return null;
  }

  const [startValue, endValue] = rangeHeader.replace("bytes=", "").split("-");
  const start = Number(startValue);
  const end = endValue ? Number(endValue) : size - 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end >= size ||
    start > end
  ) {
    return null;
  }

  return { start, end };
}

function streamFile(path: string, start?: number, end?: number) {
  return Readable.toWeb(createReadStream(path, { start, end })) as unknown as BodyInit;
}

function enforceMediaRequest(request: Request) {
  if (request.headers.get("sec-fetch-dest") !== "audio") {
    notFound();
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  enforceMediaRequest(request);

  const { id } = await params;
  const audioGenerationId = Number(id);

  if (!Number.isInteger(audioGenerationId)) {
    notFound();
  }

  const audioGeneration = await prisma.audioGeneration.findUnique({
    where: {
      id: audioGenerationId,
    },
  });

  if (!audioGeneration) {
    notFound();
  }

  const audioPath = getPrivateAudioPath(audioGeneration.filePath);
  const audioStat = await stat(audioPath).catch(() => null);

  if (!audioStat?.isFile()) {
    notFound();
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "Content-Type": "audio/mpeg",
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
  const range = getRange(request.headers.get("range"), audioStat.size);

  if (range) {
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${audioStat.size}`,
    );

    return new Response(streamFile(audioPath, range.start, range.end), {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(audioStat.size));

  return new Response(streamFile(audioPath), {
    headers,
  });
}
