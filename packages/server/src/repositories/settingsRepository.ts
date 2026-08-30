import { settings, type LiftrDb } from "@liftr/db";
import { eq } from "drizzle-orm";

/** The `settings` table is a generic k/v store (JSON-encoded value) — every reader/writer of it
 *  goes through these two functions so the JSON.parse/stringify pairing can't drift between
 *  call sites (profile, equipment, and any future single-row setting). */
export async function readJsonSetting<T>(db: LiftrDb, key: string): Promise<T | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function writeJsonSetting(db: LiftrDb, key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } });
}
