import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export async function staffHomework<T>(input: Record<string, unknown>): Promise<T> {
  const response = await httpsCallable<Record<string, unknown>, T>(functions, "staffHomework")(input);
  return response.data;
}

export async function staffHomeworkItems(input: Record<string, unknown>): Promise<unknown[]> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  do {
    const response: { items: unknown[]; nextCursor: string | null } = await staffHomework({ ...input, cursor });
    items.push(...response.items);
    cursor = response.nextCursor;
  } while (cursor);
  return items;
}
