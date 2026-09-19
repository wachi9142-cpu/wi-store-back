import { z } from "zod";
import { db } from "../lib/db";

export const deliveryTierSchema = z.array(z.object({ maxKm: z.number().positive(), fee: z.number().int().min(0) }));
export type DeliveryTier = z.infer<typeof deliveryTierSchema>[number];

export async function getSetting() {
  return db.setting.upsert({ where: { id: "main" }, update: {}, create: { id: "main" } });
}

export function parseTiers(json: unknown): DeliveryTier[] {
  const r = deliveryTierSchema.safeParse(json);
  return r.success ? [...r.data].sort((a, b) => a.maxKm - b.maxKm) : [];
}
