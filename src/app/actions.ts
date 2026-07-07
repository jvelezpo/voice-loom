"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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
