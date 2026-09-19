import { Hono } from "hono";
import { db } from "../lib/db";
import { promptpayPng } from "../lib/promptpay";
import { getSetting } from "../services/setting";

export const ordersPublic = new Hono();

// รูป QR พร้อมเพย์ของออเดอร์ — public (LINE ต้องดึงได้) id เป็น cuid เดาไม่ได้
ordersPublic.get("/:id/qr.png", async (c) => {
  const order = await db.order.findUnique({ where: { id: c.req.param("id") } });
  const setting = await getSetting();
  if (!order || !setting.promptpayId || order.total <= 0) return c.notFound();
  const png = await promptpayPng(setting.promptpayId, order.total);
  return c.body(new Uint8Array(png), 200, { "content-type": "image/png", "cache-control": "private, max-age=3600" });
});

// รูปสลิปของออเดอร์ — public เพื่อให้ LINE ส่งรูปให้แม่ได้ (id เดาไม่ได้)
ordersPublic.get("/:id/slip.jpg", async (c) => {
  const order = await db.order.findUnique({ where: { id: c.req.param("id") } });
  if (!order?.slipPath) return c.notFound();
  const file = Bun.file(order.slipPath);
  if (!(await file.exists())) return c.notFound();
  return c.body(await file.arrayBuffer(), 200, { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" });
});
