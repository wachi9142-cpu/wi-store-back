import type { Order, OrderItem, PickupSlot, User } from "../../generated/prisma/client";
import { env } from "../../env";
import { thaiDateLabel } from "../../lib/date";
import {
  cancelDraft,
  checkStockForToday,
  createDraft,
  finalizeDraft,
  getDraft,
  parseOrderText,
  quoteDelivery,
  setDelivery,
  setFulfillment,
  setPickupTime,
} from "../../services/order";
import { getSetting } from "../../services/setting";
import { activeCoupons } from "../../services/promotion";
import { reply, replyText } from "../client";
import { image, qrLocation, qrText, text } from "../messages";

type OrderWithItems = Order & { items: OrderItem[] };

const SLOT_LABEL: Record<PickupSlot, string> = { MORNING: "เช้า", AFTERNOON: "บ่าย", EVENING: "เย็น" };
const TIME_BUTTONS = ["วันนี้ เช้า", "วันนี้ บ่าย", "วันนี้ เย็น", "พรุ่งนี้ เช้า", "พรุ่งนี้ บ่าย", "พรุ่งนี้ เย็น", "ยกเลิก"];
const FULFILL_BUTTONS = ["รับเองหน้าร้าน", "จัดส่ง", "ยกเลิก"];

export function itemsText(o: OrderWithItems) {
  return o.items.map((i) => `• ${i.name} × ${i.qty} = ${i.unitPrice * i.qty} บาท`).join("\n");
}

export function pickupText(o: Order) {
  const when = o.pickupDate ? `${thaiDateLabel(o.pickupDate)} ช่วง${o.pickupSlot ? SLOT_LABEL[o.pickupSlot] : ""}` : "-";
  return o.fulfillment === "DELIVERY"
    ? `🛵 จัดส่ง ${when} (${o.distanceKm ?? "?"} กม. ค่าส่ง ${o.deliveryFee} บาท)`
    : `🏪 รับเองหน้าร้าน ${when}`;
}

export function orderSummaryText(o: OrderWithItems) {
  const lines = [`🧾 ออเดอร์ #${o.orderNo}`, itemsText(o), `รวมค่าสินค้า ${o.subtotal} บาท`];
  if (o.deliveryFee) lines.push(`ค่าส่ง ${o.deliveryFee} บาท`);
  if (o.discount) lines.push(`ส่วนลด -${o.discount} บาท`);
  lines.push(`💰 ยอดชำระ ${o.total} บาท`, pickupText(o));
  return lines.join("\n");
}

/** ข้อความ + ปุ่ม สำหรับขั้น draft ปัจจุบัน */
function promptForStep(o: OrderWithItems) {
  switch (o.draftStep) {
    case "ASK_TIME":
      return text("รับของวันไหน ช่วงเวลาไหนคะ?", qrText(TIME_BUTTONS));
    case "ASK_FULFILLMENT":
      return text("รับเองที่ร้าน หรือให้จัดส่งคะ?", qrText(FULFILL_BUTTONS));
    case "ASK_LOCATION":
      return text("กดปุ่มด้านล่างเพื่อแชร์ตำแหน่งที่ให้จัดส่งค่ะ 📍", qrLocation(["รับเองหน้าร้าน", "ยกเลิก"]));
    default:
      return text("...");
  }
}

/** ลูกค้าพิมพ์รายการสั่ง — คืน true ถ้าจัดการแล้ว */
export async function handleNewOrder(user: User, textIn: string, replyToken: string) {
  const parsed = parseOrderText(textIn);
  if (!parsed) return false;

  const setting = await getSetting();
  if (!setting.isOpen) {
    await replyText(replyToken, setting.closedMessage);
    return true;
  }

  const { order, problems } = await createDraft(user.id, parsed);
  const problemText = problems.length ? `⚠️ ${problems.map((p) => `"${p.name}" ${p.reason}`).join(", ")}\n` : "";
  if (!order) {
    await replyText(replyToken, `${problemText}พิมพ์ "เมนู" เพื่อดูรายการที่มีค่ะ`);
    return true;
  }

  await reply(replyToken, [
    text(`${problemText}รับออเดอร์แล้วค่ะ\n${itemsText(order)}\nรวม ${order.subtotal} บาท`),
    promptForStep(order),
  ]);
  return true;
}

/** ข้อความระหว่าง draft (เลือกเวลา / วิธีรับ / ยกเลิก) — คืน true ถ้าจัดการแล้ว */
export async function handleDraftText(user: User, textIn: string, replyToken: string) {
  const draft = await getDraft(user.id);
  if (!draft) return false;
  if (parseOrderText(textIn)) return false; // พิมพ์รายการใหม่ระหว่างทาง → ให้ handleNewOrder แทน draft เดิม
  const t = textIn.replace(/\s+/g, "");

  if (/^(ยกเลิก|cancel)$/i.test(t)) {
    await cancelDraft(user.id);
    await replyText(replyToken, "ยกเลิกออเดอร์แล้วค่ะ สั่งใหม่ได้เลย");
    return true;
  }

  if (draft.draftStep === "ASK_TIME") {
    const m = t.match(/^(วันนี้|พรุ่งนี้)(เช้า|บ่าย|เย็น)$/);
    if (!m) {
      await reply(replyToken, [promptForStep(draft)]);
      return true;
    }
    const dayOffset = m[1] === "วันนี้" ? 0 : 1;
    const slot = ({ เช้า: "MORNING", บ่าย: "AFTERNOON", เย็น: "EVENING" } as const)[m[2]!]!;

    if (dayOffset === 0) {
      const short = await checkStockForToday(draft.id);
      if (short.length) {
        await reply(replyToken, [
          text(`วันนี้สต็อกไม่พอค่ะ: ${short.join(", ")}\nเลือกรับพรุ่งนี้ หรือยกเลิกแล้วสั่งจำนวนใหม่ได้ค่ะ`, qrText(TIME_BUTTONS)),
        ]);
        return true;
      }
    }
    const o = await setPickupTime(draft.id, dayOffset, slot);
    await reply(replyToken, [promptForStep(o)]);
    return true;
  }

  if (draft.draftStep === "ASK_FULFILLMENT" || draft.draftStep === "ASK_LOCATION") {
    if (/^(รับเอง|รับเองหน้าร้าน|รับที่ร้าน|pickup)$/i.test(t)) {
      const o = await setFulfillment(draft.id, "PICKUP");
      return sendPaymentRequest(o, replyToken);
    }
    if (/^(จัดส่ง|ส่ง|delivery)$/i.test(t)) {
      const o = await setFulfillment(draft.id, "DELIVERY");
      await reply(replyToken, [promptForStep(o)]);
      return true;
    }
    await reply(replyToken, [promptForStep(draft)]);
    return true;
  }

  return false;
}

/** ลูกค้าแชร์ตำแหน่งระหว่างขั้น ASK_LOCATION — คืน true ถ้าจัดการแล้ว */
export async function handleDraftLocation(
  user: User,
  loc: { latitude: number; longitude: number; address?: string },
  replyToken: string,
) {
  const draft = await getDraft(user.id);
  if (!draft || draft.draftStep !== "ASK_LOCATION") return false;

  const q = await quoteDelivery(loc.latitude, loc.longitude);
  if (!q.ok) {
    const msg =
      q.reason === "TOO_FAR"
        ? `ขออภัยค่ะ ระยะทาง ${q.km!.toFixed(1)} กม. เกินพื้นที่จัดส่ง (สูงสุด ${q.maxKm} กม.)`
        : "ขออภัยค่ะ ตอนนี้ยังไม่เปิดบริการจัดส่ง";
    await reply(replyToken, [text(`${msg}\nรับเองหน้าร้านแทนไหมคะ?`, qrText(["รับเองหน้าร้าน", "ยกเลิก"]))]);
    return true;
  }

  const o = await setDelivery(draft.id, { lat: loc.latitude, lng: loc.longitude, address: loc.address, km: q.km, fee: q.fee });
  return sendPaymentRequest(o, replyToken);
}

async function sendPaymentRequest(draft: OrderWithItems, replyToken: string) {
  const o = await finalizeDraft(draft.id);
  const setting = await getSetting();
  const msgs = [text(orderSummaryText(o))];

  // มีคูปอง → เสนอปุ่มใช้คูปองก่อนโอน
  const coupons = await activeCoupons(o.userId);
  const couponQr = coupons.length ? qrText(coupons.slice(0, 5).map((c) => `ใช้คูปอง ${c.code}`)) : undefined;
  const couponHint = coupons.length ? `\n🎟 คุณมีคูปอง ${coupons.length} ใบ กดปุ่มด้านล่างเพื่อใช้ก่อนโอนได้ค่ะ` : "";

  if (setting.promptpayId) {
    msgs.push(
      image(`${env.PUBLIC_BASE_URL}/api/orders/${o.id}/qr.png`),
      text(
        `สแกน QR พร้อมเพย์ด้านบนเพื่อโอน ${o.total} บาท แล้วส่งรูปสลิปมาในแชทนี้ได้เลยค่ะ 🙏\nเมื่อแม่ค้าตรวจสอบแล้วจะแจ้งยืนยันอีกครั้งนะคะ${couponHint}`,
        couponQr,
      ),
    );
  } else {
    msgs.push(text(`ยอดชำระ ${o.total} บาท — โอนแล้วส่งรูปสลิปมาในแชทนี้ได้เลยค่ะ 🙏${couponHint}`, couponQr));
  }
  await reply(replyToken, msgs);
  return true;
}
