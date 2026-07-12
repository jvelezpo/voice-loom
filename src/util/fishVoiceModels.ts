import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;

type FishModelResponseItem = {
  _id?: unknown;
  type?: unknown;
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  languages?: unknown;
  state?: unknown;
  visibility?: unknown;
  task_count?: unknown;
};

type FishModelListResponse = {
  items?: unknown;
};

export type FishVoiceModelCandidate = {
  referenceId: string;
  title: string;
  description: string;
  tags: string[];
  languages: string[];
  taskCount: number;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter(Boolean)
    : [];
}

function parseStringArray(value: string) {
  try {
    return stringArray(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeModel(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const model = value as FishModelResponseItem;
  const referenceId = stringValue(model._id);
  const title = stringValue(model.title);

  if (!referenceId || !title) {
    return null;
  }

  return {
    referenceId,
    type: stringValue(model.type),
    title,
    description: stringValue(model.description),
    tags: stringArray(model.tags),
    languages: stringArray(model.languages),
    state: stringValue(model.state),
    visibility: stringValue(model.visibility),
    taskCount:
      typeof model.task_count === "number" && Number.isInteger(model.task_count)
        ? model.task_count
        : 0,
  };
}

async function fetchFishVoiceModels(languageCode: string) {
  const apiKey = process.env.FISH_API_KEY;

  if (!apiKey) {
    throw new Error("FISH_API_KEY is not configured.");
  }

  const url = new URL("https://api.fish.audio/model");
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("page_number", "1");
  url.searchParams.set("sort_by", "score");

  if (languageCode && languageCode !== "und") {
    url.searchParams.set("language", languageCode);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Fish voice model request failed: ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as FishModelListResponse;

  if (!Array.isArray(body.items)) {
    throw new Error("Fish voice model response did not include an items array.");
  }

  return body.items
    .map(normalizeModel)
    .filter((model): model is NonNullable<typeof model> => Boolean(model))
    .filter(
      (model) =>
        model.type === "tts" &&
        model.state === "trained" &&
        model.visibility !== "private",
    );
}

async function refreshCache(languageCode: string) {
  const models = await fetchFishVoiceModels(languageCode);
  const cachedAt = new Date();

  await prisma.$transaction([
    ...models.map((model) =>
      prisma.fishVoiceModel.upsert({
        where: { referenceId: model.referenceId },
        update: {
          title: model.title,
          description: model.description,
          tagsJson: JSON.stringify(model.tags),
          languagesJson: JSON.stringify(
            model.languages.length > 0 || languageCode === "und"
              ? model.languages
              : [languageCode],
          ),
          state: model.state,
          visibility: model.visibility,
          taskCount: model.taskCount,
          cachedAt,
        },
        create: {
          referenceId: model.referenceId,
          title: model.title,
          description: model.description,
          tagsJson: JSON.stringify(model.tags),
          languagesJson: JSON.stringify(
            model.languages.length > 0 || languageCode === "und"
              ? model.languages
              : [languageCode],
          ),
          state: model.state,
          visibility: model.visibility,
          taskCount: model.taskCount,
          cachedAt,
        },
      }),
    ),
    prisma.fishVoiceSync.upsert({
      where: { languageCode },
      update: { refreshedAt: cachedAt },
      create: { languageCode, refreshedAt: cachedAt },
    }),
  ]);
}

export async function getFishVoiceModelCandidates(languageCode: string) {
  const normalizedLanguageCode = languageCode.toLowerCase() || "und";
  const sync = await prisma.fishVoiceSync.findUnique({
    where: { languageCode: normalizedLanguageCode },
  });
  const isStale =
    !sync || Date.now() - sync.refreshedAt.getTime() >= CACHE_TTL_MS;

  if (isStale) {
    try {
      await refreshCache(normalizedLanguageCode);
    } catch (error) {
      const cachedModelCount = await prisma.fishVoiceModel.count();

      if (cachedModelCount === 0) {
        throw error;
      }

      console.warn(
        `[fish-voice-models] Refresh failed; using stale cache languageCode=${normalizedLanguageCode}`,
        error,
      );
    }
  }

  const cachedModels = await prisma.fishVoiceModel.findMany({
    where: {
      state: "trained",
      visibility: { not: "private" },
    },
    orderBy: [{ taskCount: "desc" }, { title: "asc" }],
  });

  return cachedModels
    .map<FishVoiceModelCandidate>((model) => ({
      referenceId: model.referenceId,
      title: model.title,
      description: model.description,
      tags: parseStringArray(model.tagsJson),
      languages: parseStringArray(model.languagesJson),
      taskCount: model.taskCount,
    }))
    .filter(
      (model) =>
        normalizedLanguageCode === "und" ||
        model.languages.length === 0 ||
        model.languages.some(
          (language) => language.toLowerCase() === normalizedLanguageCode,
        ),
    );
}
