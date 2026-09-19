import { Hono } from "hono";
import { z } from "zod";
import { db } from "../lib/db";
import { thaiDate } from "../lib/date";
import { adminKey } from "../middleware/admin-key";
import { confirmOrder, rejectOrder } from "../services/order-confirm";
import { pushText } from "../line/client";
import { orderSummaryText } from "../line/flows/order";
import { issueCouponsFor, releaseCouponOfOrder } from "../services/promotion";

export const admin = new Hono();
admin.use("*", adminKey);

const orderInclude = { items: true, user: { select: { id: true, displayName: true, phone: true, lineUserId: true } }, coupon: true } as const;

// รายการออเดอร์ — filter ได้ด้วย status, pickupDate, date(สร้าง)
admin.get("/orders", async (c) => {
  const q = z
    .object({
      status: z.string().optional(),
      pickupDate: z.string().optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
    })
    .parse(c.req.query());
  const orders = await db.order.findMany({
    where: {
      ...(q.status ? { status: q.status as never } : { status: { not: "DRAFT" } }),
      ...(q.pickupDate ? { pickupDate: q.pickupDate } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: q.take,
    include: orderInclude,
  });
  return c.json(orders);
});

admin.get("/orders/:id", async (c) => {
  const o = await db.order.findUnique({ where: { id: c.req.param("id") }, include: orderInclude });
  return o ? c.json(o) : c.notFound();
});

// ยืนยัน/ปฏิเสธจากหน้าเว็บ — ทำเหมือนแม่พิมพ์ใน LINE (ตัดสต็อก + แจ้งลูกค้า + ออกคูปอง)
admin.post("/orders/:id/confirm", async (c) => {
  const o = await db.order.findUnique({ where: { id: c.req.param("id") } });
  if (!o) return c.notFound();
  const { force } = z.object({ force: z.boolean().default(false) }).parse(await c.req.json().catch(() => ({})));
  const r = await confirmOrder(o.orderNo, "web", force);
  if (!r.ok) return c.json(r, 409);
  const ord = r.order!;
  await pushText(ord.user.lineUserId, `✅ แม่ค้ายืนยันออเดอร์ #${ord.orderNo} แล้วค่ะ\n${orderSummaryText(ord)}\n\nขอบคุณที่อุดหนุนนะคะ 🌿`);
  for (const cp of await issueCouponsFor(ord.userId)) {
    await pushText(ord.user.lineUserId, `🎉 ยินดีด้วยค่ะ! สะสมครบตามโปร "${cp.promoName}"\nได้รับคูปองส่วนลด ${cp.amount} บาท โค้ด: ${cp.code}`);
  }
  return c.json(ord);
});

admin.post("/orders/:id/reject", async (c) => {
  const o = await db.order.findUnique({ where: { id: c.req.param("id") } });
  if (!o) return c.notFound();
  const { reason } = z.object({ reason: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const r = await rejectOrder(o.orderNo, reason);
  if (!r.ok) return c.json(r, 409);
  await releaseCouponOfOrder(r.order.id);
  await pushText(r.order.user.lineUserId, `ขออภัยค่ะ ออเดอร์ #${r.order.orderNo} ถูกปฏิเสธ${reason ? `\nเหตุผล: ${reason}` : ""}`);
  return c.json(r.order);
});

// สรุปภาพรวมสำหรับหน้าแรก
admin.get("/stats", async (c) => {
  const today = thaiDate(0);
  const tomorrow = thaiDate(1);
  const [pendingConfirm, pendingPayment, todayPickup, tomorrowPickup, confirmedToday, setting, lastBot, lastBotError] =
    await Promise.all([
      db.order.count({ where: { status: "PENDING_CONFIRM" } }),
      db.order.count({ where: { status: "PENDING_PAYMENT" } }),
      db.order.count({ where: { pickupDate: today, status: { in: ["CONFIRMED", "PENDING_CONFIRM", "PENDING_PAYMENT"] } } }),
      db.order.count({ where: { pickupDate: tomorrow, status: { in: ["CONFIRMED", "PENDING_CONFIRM", "PENDING_PAYMENT"] } } }),
      db.order.aggregate({ where: { status: "CONFIRMED", confirmedAt: { gte: new Date(`${today}T00:00:00+07:00`) } }, _sum: { total: true }, _count: true }),
      db.setting.findUnique({ where: { id: "main" } }),
      db.botLog.findFirst({ orderBy: { createdAt: "desc" } }),
      db.botLog.findFirst({ where: { ok: false }, orderBy: { createdAt: "desc" } }),
    ]);
  return c.json({
    today,
    pendingConfirm,
    pendingPayment,
    todayPickup,
    tomorrowPickup,
    confirmedTodayCount: confirmedToday._count,
    confirmedTodayTotal: confirmedToday._sum.total ?? 0,
    isOpen: setting?.isOpen ?? true,
    bot: { lastEventAt: lastBot?.createdAt ?? null, lastError: lastBotError ? { at: lastBotError.createdAt, error: lastBotError.error } : null },
  });
});

// log บอท (ดู dead bot / error)
admin.get("/bot-logs", async (c) => {
  const q = z.object({ onlyErrors: z.enum(["true", "false"]).default("false").transform((v) => v === "true"), take: z.coerce.number().int().min(1).max(500).default(100) }).parse(c.req.query());
  return c.json(await db.botLog.findMany({ where: q.onlyErrors ? { ok: false } : undefined, orderBy: { createdAt: "desc" }, take: q.take }));
});

admin.get("/users", async (c) =>
  c.json(await db.user.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { orders: true, coupons: true } } } })),
);
