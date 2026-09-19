import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { adminKey } from "../middleware/admin-key";
import { adjustStock, listProducts } from "../services/product";

const productBody = z.object({
  name: z.string().trim().min(1),
  price: z.number().int().min(0),
  unit: z.string().trim().min(1).default("ขวด"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const products = new Hono();

products.use("*", adminKey);

products.get("/", async (c) => c.json(await listProducts()));

products.post("/", async (c) => {
  const body = productBody.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const created = await db.product.create({ data: body.data });
  return c.json(created, 201);
});

products.patch("/:id", async (c) => {
  const body = productBody.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const updated = await db.product.update({ where: { id: c.req.param("id") }, data: body.data });
  return c.json(updated);
});

// ตั้งสต็อกจากหน้าเว็บ (บันทึก StockLog ด้วย)
products.put("/:id/stock", async (c) => {
  const body = z.object({ stock: z.number().int().min(0) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const updated = await adjustStock({ productId: c.req.param("id"), set: body.data.stock, reason: "WEB" });
  return c.json(updated);
});

products.delete("/:id", async (c) => {
  // soft delete — เก็บประวัติออเดอร์/สต็อกไว้
  const updated = await db.product.update({ where: { id: c.req.param("id") }, data: { active: false } });
  return c.json(updated);
});

products.get("/:id/stock-logs", async (c) => {
  const logs = await db.stockLog.findMany({
    where: { productId: c.req.param("id") },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json(logs);
});
