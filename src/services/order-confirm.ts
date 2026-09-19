import { mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import { db } from "../lib/db";
import { lineBlobClient } from "../line/client";
import { adjustStock } from "./product";

const withItems = { items: true, user: true } as const;

/** ออเดอร์ที่รอสลิปของลูกค้าคนนี้ (ล่าสุดก่อน) */
export function findAwaitingPayment(userId: string) {
  return db.order.findFirst({
    where: { userId, status: "PENDING_PAYMENT" },
    orderBy: { createdAt: "desc" },
    include: withItems,
  });
}

/** ดาวน์โหลดรูปสลิปจาก LINE เก็บลงดิสก์ แล้วเปลี่ยนสถานะเป็นรอแม่ยืนยัน */
export async function attachSlip(orderId: string, messageId: string) {
  const dir = path.resolve(env.UPLOAD_DIR, "slips");
  await mkdir(dir, { recursive: true });

  const file = path.join(dir, `${orderId}.jpg`);
  if (env.LINE_DRY_RUN) {
    await Bun.write(file, "dry-run slip");
  } else {
    const stream = await lineBlobClient.getMessageContent(messageId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    await Bun.write(file, Buffer.concat(chunks));
  }

  return db.order.update({
    where: { id: orderId },
    data: { status: "PENDING_CONFIRM", slipMessageId: messageId, slipPath: file, slipAt: new Date() },
    include: withItems,
  });
}

export function findByOrderNo(orderNo: number) {
  return db.order.findUnique({ where: { orderNo }, include: withItems });
}

export type ConfirmResult =
  | { ok: true; order: Awaited<ReturnType<typeof findByOrderNo>> }
  | { ok: false; reason: "NOT_FOUND" | "BAD_STATUS" | "STOCK_SHORT"; short?: string[]; status?: string };

/**
 * แม่ยืนยันออเดอร์ → ตัดสต็อกทุกรายการ (transaction)
 * force = ยืนยันโดยไม่ตัดสต็อก (กรณีสต็อกในระบบไม่ตรงของจริง)
 */
export async function confirmOrder(orderNo: number, adminUserId: string, force = false): Promise<ConfirmResult> {
  const order = await findByOrderNo(orderNo);
  if (!order) return { ok: false, reason: "NOT_FOUND" };
  if (order.status !== "PENDING_CONFIRM" && order.status !== "PENDING_PAYMENT") {
    return { ok: false, reason: "BAD_STATUS", status: order.status };
  }

  if (!force) {
    const short: string[] = [];
    for (const it of order.items) {
      const p = await db.product.findUnique({ where: { id: it.productId } });
      if (!p || p.stock < it.qty) short.push(`${it.name} ต้องการ ${it.qty} เหลือ ${p?.stock ?? 0}`);
    }
    if (short.length) return { ok: false, reason: "STOCK_SHORT", short };

    for (const it of order.items) {
      await adjustStock({
        productId: it.productId,
        delta: -it.qty,
        reason: "ORDER",
        note: `ออเดอร์ #${order.orderNo}`,
        byUserId: adminUserId,
      });
    }
  }

  const updated = await db.order.update({
    where: { id: order.id },
    data: { status: "CONFIRMED", confirmedAt: new Date(), stockDeducted: !force },
    include: withItems,
  });
  return { ok: true, order: updated };
}

export async function rejectOrder(orderNo: number, reason?: string) {
  const order = await findByOrderNo(orderNo);
  if (!order) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (order.status !== "PENDING_CONFIRM" && order.status !== "PENDING_PAYMENT") {
    return { ok: false as const, reason: "BAD_STATUS" as const, status: order.status };
  }
  const updated = await db.order.update({
    where: { id: order.id },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectReason: reason },
    include: withItems,
  });
  return { ok: true as const, order: updated };
}

/** ออเดอร์ที่รอแม่ตรวจสลิป */
export function listPendingConfirm() {
  return db.order.findMany({ where: { status: "PENDING_CONFIRM" }, orderBy: { slipAt: "asc" }, include: withItems });
}

export function listAdmins() {
  return db.user.findMany({ where: { role: "ADMIN" } });
}
