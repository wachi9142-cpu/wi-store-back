import type { Fulfillment, PickupSlot } from "../generated/prisma/client";
import { db } from "../lib/db";
import { distanceKm } from "../lib/geo";
import { thaiDate } from "../lib/date";
import { findProductByText } from "./product";
import { getSetting, parseTiers } from "./setting";

export type ParsedItem = { name: string; qty: number };

/** แยกบรรทัด "เก็กฮวย 2 ขวด" / "น้ำเต้าหู้ x3" / "เก็กฮวย 2" — คืน null ถ้าไม่มีบรรทัดไหน parse ได้ */
export function parseOrderText(text: string): ParsedItem[] | null {
  const items: ParsedItem[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*[x×]?\s*(\d+)\s*(ขวด|แก้ว|ถุง|ชิ้น|อัน)?$/i);
    if (!m) return null;
    const qty = Number(m[2]);
    if (qty <= 0) return null;
    items.push({ name: m[1]!.trim(), qty });
  }
  return items.length ? items : null;
}

export type ItemProblem = { name: string; reason: string };

/** สร้างออเดอร์ DRAFT จากรายการที่พิมพ์ (ลบ draft เดิมของลูกค้าคนนี้ทิ้งก่อน) */
export async function createDraft(userId: string, parsed: ParsedItem[]) {
  const problems: ItemProblem[] = [];
  const items: { productId: string; name: string; unitPrice: number; qty: number }[] = [];

  for (const p of parsed) {
    const product = await findProductByText(p.name);
    if (!product || !product.active) {
      problems.push({ name: p.name, reason: "ไม่มีสินค้านี้" });
      continue;
    }
    const existing = items.find((i) => i.productId === product.id);
    if (existing) existing.qty += p.qty;
    else items.push({ productId: product.id, name: product.name, unitPrice: product.price, qty: p.qty });
  }
  if (items.length === 0) return { order: null, problems };

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  await db.order.deleteMany({ where: { userId, status: "DRAFT" } });
  const order = await db.order.create({
    data: { userId, status: "DRAFT", draftStep: "ASK_TIME", subtotal, total: subtotal, items: { create: items } },
    include: { items: true },
  });
  return { order, problems };
}

export function getDraft(userId: string) {
  return db.order.findFirst({ where: { userId, status: "DRAFT" }, include: { items: true }, orderBy: { createdAt: "desc" } });
}

/** ตรวจว่าสต็อกวันนี้พอไหม — ใช้เฉพาะออเดอร์ที่รับ "วันนี้" (วันหน้าแม่ทำเพิ่มได้) */
export async function checkStockForToday(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const short: string[] = [];
  for (const it of order.items) {
    const p = await db.product.findUnique({ where: { id: it.productId } });
    if (!p || p.stock < it.qty) short.push(`${it.name} (เหลือ ${p?.stock ?? 0})`);
  }
  return short;
}

export async function setPickupTime(orderId: string, dayOffset: 0 | 1, slot: PickupSlot) {
  return db.order.update({
    where: { id: orderId },
    data: { pickupDate: thaiDate(dayOffset), pickupSlot: slot, draftStep: "ASK_FULFILLMENT" },
    include: { items: true },
  });
}

export async function setFulfillment(orderId: string, fulfillment: Fulfillment) {
  return db.order.update({
    where: { id: orderId },
    data: { fulfillment, draftStep: fulfillment === "DELIVERY" ? "ASK_LOCATION" : null },
    include: { items: true },
  });
}

export type DeliveryQuote =
  | { ok: true; km: number; fee: number }
  | { ok: false; reason: "NO_SHOP_LOCATION" | "NO_TIERS" | "TOO_FAR"; km?: number; maxKm?: number };

export async function quoteDelivery(lat: number, lng: number): Promise<DeliveryQuote> {
  const s = await getSetting();
  if (s.shopLat == null || s.shopLng == null) return { ok: false, reason: "NO_SHOP_LOCATION" };
  const tiers = parseTiers(s.deliveryTiers);
  if (tiers.length === 0) return { ok: false, reason: "NO_TIERS" };
  const km = distanceKm(s.shopLat, s.shopLng, lat, lng);
  const tier = tiers.find((t) => km <= t.maxKm);
  if (!tier) return { ok: false, reason: "TOO_FAR", km, maxKm: tiers[tiers.length - 1]!.maxKm };
  return { ok: true, km, fee: tier.fee };
}

export async function setDelivery(orderId: string, d: { lat: number; lng: number; address?: string; km: number; fee: number }) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  return db.order.update({
    where: { id: orderId },
    data: {
      deliveryLat: d.lat,
      deliveryLng: d.lng,
      deliveryAddress: d.address,
      distanceKm: Math.round(d.km * 10) / 10,
      deliveryFee: d.fee,
      total: o.subtotal + d.fee - o.discount,
      draftStep: null,
    },
    include: { items: true },
  });
}

/** ปิด draft → รอชำระเงิน */
export function finalizeDraft(orderId: string) {
  return db.order.update({
    where: { id: orderId },
    data: { status: "PENDING_PAYMENT", draftStep: null },
    include: { items: true },
  });
}

export function cancelDraft(userId: string) {
  return db.order.deleteMany({ where: { userId, status: "DRAFT" } });
}
