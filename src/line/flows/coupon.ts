import type { User } from "../../generated/prisma/client";
import { env } from "../../env";
import { findAwaitingPayment } from "../../services/order-confirm";
import { activeCoupons, activePromotions, applyCouponToOrder, promoProgress, redeemCouponAtShop } from "../../services/promotion";
import { db } from "../../lib/db";
import { normalizePhone } from "../../lib/phone";
import { reply, replyText } from "../client";
import { image, text } from "../messages";
import { orderSummaryText } from "./order";
import { notifyAdminsPendingOrder } from "./confirm";

/** ข้อความสรุปคูปอง + ความคืบหน้าโปรของลูกค้า */
export async function couponStatusText(userId: string) {
  const coupons = await activeCoupons(userId);
  const promos = await activePromotions();
  const lines: string[] = [];

  if (coupons.length) {
    lines.push("🎟 คูปองที่ใช้ได้");
    for (const c of coupons) lines.push(`• ${c.code} ลด ${c.amount} บาท (${c.promotion.name})`);
    lines.push('ใช้กับออเดอร์ใน LINE: พิมพ์ "ใช้คูปอง <โค้ด>" หลังสั่ง\nใช้หน้าร้าน: แจ้งโค้ดกับแม่ค้าได้เลย');
  } else {
    lines.push("ยังไม่มีคูปองค่ะ");
  }

  if (promos.length) {
    lines.push("", "🎯 โปรที่กำลังจัด");
    for (const p of promos) {
      const { qty } = await promoProgress(userId, p);
      const inCycle = qty % p.targetQty;
      lines.push(`• ${p.name}: ซื้อครบ ${p.targetQty} ได้คูปอง ${p.rewardAmount} บาท (ถึง ${p.endDate})\n  สะสมแล้ว ${inCycle}/${p.targetQty}`);
    }
  }
  return lines.join("\n");
}

/** ลูกค้า: "คูปอง" / "ใช้คูปอง ABC123" — คืน true ถ้าจัดการแล้ว */
export async function handleCustomerCoupon(user: User, textIn: string, replyToken: string) {
  if (/^(คูปอง|coupon|โปร|โปรโมชั่น)$/i.test(textIn)) {
    await replyText(replyToken, await couponStatusText(user.id));
    return true;
  }

  const m = textIn.match(/^(ใช้คูปอง|ใช้โค้ด|use)\s*([A-Za-z0-9]{4,10})$/i);
  if (!m) return false;

  const order = await findAwaitingPayment(user.id);
  if (!order) {
    await replyText(replyToken, "ยังไม่มีออเดอร์ที่รอชำระค่ะ สั่งของก่อนแล้วค่อยพิมพ์ใช้คูปองนะคะ");
    return true;
  }
  const r = await applyCouponToOrder(m[2]!, order.id);
  if (!r.ok) {
    const msg = {
      NOT_FOUND: "ไม่พบคูปองโค้ดนี้ค่ะ",
      NOT_OWNER: "คูปองนี้ไม่ใช่ของคุณค่ะ",
      USED: "คูปองนี้ถูกใช้ไปแล้วค่ะ",
      ALREADY_APPLIED: "ออเดอร์นี้ใช้คูปองไปแล้วค่ะ (ใช้ได้ 1 ใบต่อออเดอร์)",
    }[r.reason];
    await replyText(replyToken, msg);
    return true;
  }
  const msgs = [text(`ใช้คูปอง ${r.coupon.code} ลด ${r.order.discount} บาทแล้วค่ะ ✅\n${orderSummaryText(r.order)}`)];

  if (r.order.total <= 0) {
    // ยอด 0 ไม่ต้องโอน → ส่งให้แม่ยืนยันเลย
    const o = await db.order.update({
      where: { id: r.order.id },
      data: { status: "PENDING_CONFIRM", slipAt: new Date() },
      include: { items: true, user: true },
    });
    msgs.push(text("ยอดชำระ 0 บาท ไม่ต้องโอนค่ะ รอแม่ค้ายืนยันสักครู่นะคะ 🙏"));
    await reply(replyToken, msgs);
    await notifyAdminsPendingOrder(o, false);
    return true;
  }

  const setting = await db.setting.findUnique({ where: { id: "main" } });
  if (setting?.promptpayId) {
    msgs.push(image(`${env.PUBLIC_BASE_URL}/api/orders/${r.order.id}/qr.png`), text(`โอน ${r.order.total} บาท แล้วส่งรูปสลิปมาได้เลยค่ะ 🙏`));
  } else {
    msgs.push(text(`โอน ${r.order.total} บาท แล้วส่งรูปสลิปมาได้เลยค่ะ 🙏`));
  }
  await reply(replyToken, msgs);
  return true;
}

/**
 * แม่: "ใช้คูปอง ABC123" (ลูกค้าซื้อหน้าร้าน) / "คูปอง 0812345678" (ดูคูปองของลูกค้า) — คืน true ถ้าจัดการแล้ว
 */
export async function handleAdminCoupon(textIn: string, replyToken: string) {
  const use = textIn.match(/^(ใช้คูปอง|ใช้โค้ด|use)\s*([A-Za-z0-9]{4,10})$/i);
  if (use) {
    const r = await redeemCouponAtShop(use[2]!);
    if (!r.ok) {
      await replyText(replyToken, r.reason === "NOT_FOUND" ? "ไม่พบคูปองโค้ดนี้ค่ะ" : "คูปองนี้ถูกใช้ไปแล้วค่ะ");
      return true;
    }
    const c = r.coupon;
    await replyText(replyToken, `✅ ใช้คูปอง ${c.code} ลด ${c.amount} บาท ให้ ${c.user.displayName ?? ""} (${c.user.phone ?? "-"}) แล้วค่ะ`);
    return true;
  }

  const look = textIn.match(/^(คูปอง|coupon)\s+(.+)$/i);
  if (look) {
    const phone = normalizePhone(look[2]!);
    const user = phone ? await db.user.findFirst({ where: { phone } }) : null;
    if (!user) {
      await replyText(replyToken, "ไม่พบลูกค้าเบอร์นี้ค่ะ");
      return true;
    }
    await replyText(replyToken, `ลูกค้า ${user.displayName ?? ""} (${phone})\n${await couponStatusText(user.id)}`);
    return true;
  }

  return false;
}
