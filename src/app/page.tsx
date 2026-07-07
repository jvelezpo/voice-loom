import { connection } from "next/server";
import Link from "next/link";
import { createTextEntry } from "./actions";
import { SubmitButton } from "./submit-button";
import { prisma } from "@/lib/prisma";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function Home() {
  await connection();

  const entries = await prisma.textEntry.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Audio Generator
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-normal text-zinc-950 sm:text-4xl">
                Text queue
              </h1>
              <p className="mt-3 text-base leading-7 text-zinc-600">
                Save source text now. Audio generation and streaming can plug
                into these records next.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm">
              <span className="font-semibold text-zinc-950">
                {entries.length}
              </span>{" "}
              saved
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
          <form action={createTextEntry} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="content"
                className="text-sm font-medium text-zinc-800"
              >
                Text
              </label>
              <textarea
                id="content"
                name="content"
                required
                rows={8}
                placeholder="Paste text here..."
                className="min-h-48 resize-y rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              />
            </div>
            <div className="flex justify-end">
              <SubmitButton />
            </div>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-950">
              Saved texts
            </h2>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
              No saved text yet.
            </div>
          ) : (
            <ul className="grid gap-3">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/texts/${entry.id}`}
                    className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <p className="whitespace-pre-wrap text-base leading-7 text-zinc-800">
                        {entry.content}
                      </p>
                      <time
                        dateTime={entry.createdAt.toISOString()}
                        className="shrink-0 text-sm text-zinc-500"
                      >
                        {dateFormatter.format(entry.createdAt)}
                      </time>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
