import { db } from "../../lib/db";
import { getSetting } from "../../services/setting";
import { replyText } from "../client";

/**
 * แม่ค้าเปิด/ปิดร้าน — คืน true ถ้าจัดการแล้ว
 *   ปิดร้าน [ข้อความแจ้งลูกค้า]   → ลูกค้าสั่งไม่ได้ บอทตอบข้อความนี้
 *   เปิดร้าน                        → กลับมารับออเดอร์
 *   สถานะร้าน                       → ดูว่าเปิดหรือปิดอยู่
 */
export async function handleAdminShop(text: string, replyToken: string) {
  const close = text.match(/^(ปิดร้าน|close)\s*(.*)$/i);
  if (close) {
    const msg = close[2]?.trim();
    await getSetting();
    const s = await db.setting.update({
      where: { id: "main" },
      data: { isOpen: false, ...(msg ? { closedMessage: msg } : {}) },
    });
    await replyText(replyToken, `🔒 ปิดร้านชั่วคราวแล้ว\nลูกค้าที่สั่งจะเห็นข้อความ: "${s.closedMessage}"\nพิมพ์ "เปิดร้าน" เมื่อพร้อมขาย`);
    return true;
  }

  if (/^(เปิดร้าน|open)$/i.test(text)) {
    await getSetting();
    await db.setting.update({ where: { id: "main" }, data: { isOpen: true } });
    await replyText(replyToken, "🔓 เปิดร้านแล้ว รับออเดอร์ได้ตามปกติค่ะ");
    return true;
  }

  if (/^(สถานะร้าน|สถานะ|status)$/i.test(text)) {
    const s = await getSetting();
    await replyText(replyToken, s.isOpen ? "🔓 ร้านเปิดอยู่ค่ะ" : `🔒 ร้านปิดชั่วคราวอยู่ค่ะ\nข้อความที่ลูกค้าเห็น: "${s.closedMessage}"`);
    return true;
  }

  return false;
}
