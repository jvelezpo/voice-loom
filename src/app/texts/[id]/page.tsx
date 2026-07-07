import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VOICES } from "@/util/constant";
import { AudioGenerations } from "./audio-generations";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
            audioGenerations={entry.audioGenerations.map((audioGeneration) => ({
              id: audioGeneration.id,
              voiceKey: audioGeneration.voiceKey,
              voiceLabel: getVoiceLabel(audioGeneration.voiceKey),
              createdAt: audioGeneration.createdAt.toISOString(),
              createdAtLabel: dateFormatter.format(audioGeneration.createdAt),
            }))}
          />
        </article>
      </div>
    </main>
  );
}
