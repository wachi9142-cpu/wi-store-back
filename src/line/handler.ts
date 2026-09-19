import type { webhook as line } from "@line/bot-sdk";
import { getOrCreateUser } from "../services/user";
import { replyText } from "./client";
import { ASK_PHONE_TEXT, handleAdminClaim, handleRegistration } from "./flows/register";
import { handleAdminStock } from "./flows/stock";
import { handleMenu } from "./flows/menu";
import { handleAdminHelp } from "./flows/help";
import { handleDraftLocation, handleDraftText, handleNewOrder } from "./flows/order";
import { handleAdminOrder, handleSlipImage } from "./flows/confirm";
import { handleAdminShop } from "./flows/shop";
import { handleAdminCoupon, handleCustomerCoupon } from "./flows/coupon";
import { getSetting } from "../services/setting";

export async function handleEvent(ev: line.Event) {
  console.log("[line] event", ev.type, JSON.stringify(ev).slice(0, 300));

  const src = ev.source;
  if (!src || src.type !== "user" || !src.userId) return;
  const lineUserId = src.userId;

  // เพิ่มเพื่อน / ปลดบล็อก → ทักทายและขอเบอร์
  if (ev.type === "follow") {
    if (!ev.replyToken) return;
    const user = await getOrCreateUser(lineUserId);
    await replyText(ev.replyToken, user.phone ? "ยินดีต้อนรับกลับมาค่ะ 🌿" : ASK_PHONE_TEXT);
    return;
  }

  if (ev.type !== "message" || !ev.replyToken) return;
  const replyToken = ev.replyToken;
  const user = await getOrCreateUser(lineUserId);

  // ลูกค้าแชร์ตำแหน่ง (ขั้นเลือกที่จัดส่ง)
  if (ev.message.type === "location") {
    if (!user.phone) return replyText(replyToken, ASK_PHONE_TEXT);
    const { latitude, longitude, address } = ev.message;
    if (await handleDraftLocation(user, { latitude, longitude, address }, replyToken)) return;
    return replyText(replyToken, "ได้รับตำแหน่งแล้วค่ะ แต่ตอนนี้ไม่มีออเดอร์ที่รอที่อยู่จัดส่งนะคะ");
  }

  // ลูกค้าส่งรูป = สลิปโอนเงิน
  if (ev.message.type === "image") {
    if (!user.phone) return replyText(replyToken, ASK_PHONE_TEXT);
    if (user.role === "ADMIN") return;
    await handleSlipImage(user, ev.message.id, replyToken);
    return;
  }

  if (ev.message.type !== "text") return;
  const text = ev.message.text.trim();

  if (await handleAdminClaim(user, text, replyToken)) return;
  if (await handleRegistration(user, text, replyToken)) return;

  if (await handleMenu(text, replyToken)) return;

  if (user.role === "ADMIN") {
    if (await handleAdminHelp(text, replyToken)) return;
    if (await handleAdminOrder(user, text, replyToken)) return;
    if (await handleAdminShop(text, replyToken)) return;
    if (await handleAdminCoupon(text, replyToken)) return;
    if (await handleAdminStock(user, text, replyToken)) return;

    await replyText(replyToken, "ไม่เข้าใจคำสั่งค่ะ พิมพ์ \"ช่วยเหลือ\" เพื่อดูคำสั่งทั้งหมด");
    return;
  }

  const setting = await getSetting();
  if (!setting.isOpen) {
    await replyText(replyToken, setting.closedMessage);
    return;
  }

  // ลูกค้า: ตอบขั้นตอน draft ก่อน (เลือกเวลา/วิธีรับ/ยกเลิก) แล้วค่อยมองเป็นออเดอร์ใหม่
  if (await handleCustomerCoupon(user, text, replyToken)) return;
  if (await handleDraftText(user, text, replyToken)) return;
  if (await handleNewOrder(user, text, replyToken)) return;

  await replyText(replyToken, "พิมพ์ \"เมนู\" เพื่อดูรายการ, \"คูปอง\" เพื่อดูโปร หรือสั่งได้เลย เช่น \"เก็กฮวย 2 ขวด\" ค่ะ");
}
