import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { adminKey } from "../middleware/admin-key";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ต้องเป็น YYYY-MM-DD");
const promoBody = z.object({
  name: z.string().trim().min(1),
  startDate: ymd,
  endDate: ymd,
  targetQty: z.number().int().positive(),
  rewardAmount: z.number().int().positive(),
  productId: z.string().nullable().default(null),
  active: z.boolean().default(true),
});

export const promotions = new Hono();
promotions.use("*", adminKey);

promotions.get("/", async (c) =>
  c.json(await db.promotion.findMany({ orderBy: { startDate: "desc" }, include: { _count: { select: { coupons: true } } } })),
);

promotions.post("/", async (c) => {
  const body = promoBody.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  if (body.data.endDate < body.data.startDate) return c.json({ error: "endDate ต้องไม่ก่อน startDate" }, 400);
  return c.json(await db.promotion.create({ data: body.data }), 201);
});

promotions.patch("/:id", async (c) => {
  const body = promoBody.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  return c.json(await db.promotion.update({ where: { id: c.req.param("id") }, data: body.data }));
});

promotions.delete("/:id", async (c) =>
  c.json(await db.promotion.update({ where: { id: c.req.param("id") }, data: { active: false } })),
);

// คูปองทั้งหมด (ดูบนเว็บ)
promotions.get("/coupons", async (c) =>
  c.json(
    await db.coupon.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { displayName: true, phone: true } }, promotion: { select: { name: true } } },
    }),
  ),
);
