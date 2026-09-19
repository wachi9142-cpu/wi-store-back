import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { adminKey } from "../middleware/admin-key";
import { deliveryTierSchema, getSetting } from "../services/setting";

const body = z
  .object({
    shopName: z.string().trim().min(1),
    promptpayId: z.string().trim().min(10).nullable(),
    shopLat: z.number().nullable(),
    shopLng: z.number().nullable(),
    deliveryTiers: deliveryTierSchema,
    isOpen: z.boolean(),
    closedMessage: z.string().trim().min(1),
  })
  .partial();

export const settings = new Hono();
settings.use("*", adminKey);

settings.get("/", async (c) => c.json(await getSetting()));

settings.put("/", async (c) => {
  const parsed = body.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await getSetting();
  const updated = await db.setting.update({ where: { id: "main" }, data: parsed.data });
  return c.json(updated);
});
