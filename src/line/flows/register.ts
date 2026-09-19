import type { User } from "../../generated/prisma/client";
import { normalizePhone } from "../../lib/phone";
import { isAdminPhone, promoteToAdmin, setPhone } from "../../services/user";
import { replyText } from "../client";

export const ASK_PHONE_TEXT =
  "สวัสดีค่ะ 🌿 ยินดีต้อนรับสู่ร้านน้ำเต้าหู้และน้ำสมุนไพรโฮมเมด\nก่อนสั่งซื้อ รบกวนพิมพ์เบอร์โทรศัพท์ของคุณเพื่อลงทะเบียนค่ะ (เช่น 0812345678)";

/**
 * จัดการข้อความรูปแบบ `admin <เบอร์>` — ถ้าเบอร์ตรงกับ ADMIN_PHONE ยกเป็นแม่ค้า
 * คืน true ถ้าข้อความนี้ถูกจัดการแล้ว
 */
export async function handleAdminClaim(user: User, text: string, replyToken: string) {
  const m = text.trim().match(/^admin\s+(.+)$/i);
  if (!m) return false;

  const phone = normalizePhone(m[1]!);
  if (phone && isAdminPhone(phone)) {
    await promoteToAdmin(user.id, phone);
    await replyText(replyToken, "ยืนยันตัวตนแม่ค้าเรียบร้อยค่ะ 👩‍🍳\nพิมพ์ \"ช่วยเหลือ\" เพื่อดูคำสั่งทั้งหมด");
  } else {
    await replyText(replyToken, "เบอร์ไม่ถูกต้อง ไม่สามารถยืนยันเป็นแม่ค้าได้ค่ะ");
  }
  return true;
}

/**
 * ผู้ใช้ที่ยังไม่มีเบอร์ → ข้อความที่ส่งมาต้องเป็นเบอร์โทร
 * คืน true ถ้าข้อความนี้ถูกจัดการแล้ว (ยังลงทะเบียนไม่เสร็จหรือเพิ่งเสร็จ)
 */
export async function handleRegistration(user: User, text: string, replyToken: string) {
  if (user.phone) return false;

  const phone = normalizePhone(text);
  if (!phone) {
    await replyText(replyToken, ASK_PHONE_TEXT);
    return true;
  }

  await setPhone(user.id, phone);
  await replyText(
    replyToken,
    `ลงทะเบียนเรียบร้อยค่ะ ✅ (เบอร์ ${phone})\nพิมพ์ "เมนู" เพื่อดูน้ำที่มีวันนี้ หรือพิมพ์สั่งได้เลย เช่น "เก็กฮวย 2 ขวด"`,
  );
  return true;
}
