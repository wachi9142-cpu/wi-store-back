import { db } from "../lib/db";
import { thaiDate } from "../lib/date";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ตัด 0/O/1/I กันสับสน

function genCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/** โปรที่กำลังจัดอยู่ ณ วันนี้ (เวลาไทย) */
export function activePromotions(date = thaiDate(0)) {
  return db.promotion.findMany({
    where: { active: true, startDate: { lte: date }, endDate: { gte: date } },
    orderBy: { startDate: "asc" },
  });
}

/** ยอดสะสมของลูกค้าในโปรนี้ = รวม qty จากออเดอร์ที่ยืนยันแล้ว ซึ่ง confirmedAt อยู่ในช่วงวันโปร */
export async function promoProgress(userId: string, promo: { id: string; startDate: string; endDate: string; productId: string | null }) {
  const start = new Date(`${promo.startDate}T00:00:00+07:00`);
  const end = new Date(`${promo.endDate}T23:59:59.999+07:00`);
  const items = await db.orderItem.findMany({
    where: {
      ...(promo.productId ? { productId: promo.productId } : {}),
      order: { userId, status: "CONFIRMED", confirmedAt: { gte: start, lte: end } },
    },
    select: { qty: true },
  });
  const qty = items.reduce((s, i) => s + i.qty, 0);
  const issued = await db.coupon.count({ where: { userId, promotionId: promo.id } });
  return { qty, issued };
}

/**
 * เรียกหลังยืนยันออเดอร์ — ออกคูปองให้ครบตามยอดสะสม
 * คืนรายการคูปองที่เพิ่งออกใหม่ (ว่างถ้ายังไม่ถึงเป้า)
 */
export async function issueCouponsFor(userId: string) {
  const promos = await activePromotions();
  const issued: { code: string; amount: number; promoName: string }[] = [];

  for (const promo of promos) {
    const { qty, issued: already } = await promoProgress(userId, promo);
    const earned = Math.floor(qty / promo.targetQty);
    for (let i = already; i < earned; i++) {
      const c = await db.coupon.create({
        data: { code: genCode(), userId, promotionId: promo.id, amount: promo.rewardAmount },
      });
      issued.push({ code: c.code, amount: c.amount, promoName: promo.name });
    }
  }
  return issued;
}

export function activeCoupons(userId: string) {
  return db.coupon.findMany({ where: { userId, status: "ACTIVE" }, include: { promotion: true }, orderBy: { createdAt: "asc" } });
}

export function findCoupon(code: string) {
  return db.coupon.findUnique({ where: { code: code.toUpperCase() }, include: { user: true, promotion: true } });
}

/** ใช้คูปองกับออเดอร์ที่รอชำระ → หักส่วนลด (ไม่ต่ำกว่า 0) */
export async function applyCouponToOrder(code: string, orderId: string) {
  const coupon = await findCoupon(code);
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { coupon: true } });
  if (!coupon) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (coupon.userId !== order.userId) return { ok: false as const, reason: "NOT_OWNER" as const };
  if (coupon.status !== "ACTIVE") return { ok: false as const, reason: "USED" as const };
  if (order.coupon) return { ok: false as const, reason: "ALREADY_APPLIED" as const };

  const discount = Math.min(coupon.amount, order.subtotal + order.deliveryFee);
  const [updated] = await db.$transaction([
    db.order.update({
      where: { id: orderId },
      data: { discount, total: order.subtotal + order.deliveryFee - discount },
      include: { items: true },
    }),
    db.coupon.update({
      where: { id: coupon.id },
      data: { status: "USED", usedAt: new Date(), usedOrderId: orderId, usedNote: "ใช้ในออเดอร์ LINE" },
    }),
  ]);
  return { ok: true as const, order: updated, coupon };
}

/** แม่ใช้คูปองให้ลูกค้าที่หน้าร้าน (ซื้ออะไรก็ได้) */
export async function redeemCouponAtShop(code: string, note = "หน้าร้าน") {
  const coupon = await findCoupon(code);
  if (!coupon) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (coupon.status !== "ACTIVE") return { ok: false as const, reason: "USED" as const };
  const updated = await db.coupon.update({
    where: { id: coupon.id },
    data: { status: "USED", usedAt: new Date(), usedNote: note },
    include: { user: true, promotion: true },
  });
  return { ok: true as const, coupon: updated };
}

/** ออเดอร์ถูกปฏิเสธ → คืนคูปองที่ใช้ไปให้ลูกค้า */
export async function releaseCouponOfOrder(orderId: string) {
  await db.coupon.updateMany({
    where: { usedOrderId: orderId, status: "USED" },
    data: { status: "ACTIVE", usedAt: null, usedOrderId: null, usedNote: null },
  });
}
