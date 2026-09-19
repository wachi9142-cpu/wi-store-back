import { db } from "../lib/db";
import { env } from "../env";
import { lineClient } from "../line/client";

export async function getOrCreateUser(lineUserId: string) {
  const existing = await db.user.findUnique({ where: { lineUserId } });
  if (existing) return existing;

  let displayName: string | undefined;
  try {
    displayName = (await lineClient.getProfile(lineUserId)).displayName;
  } catch {
    // ผู้ใช้อาจบล็อก OA หรือ token ผิด — ไม่ต้องล้ม
  }
  return db.user.create({ data: { lineUserId, displayName } });
}

export function setPhone(id: string, phone: string) {
  return db.user.update({ where: { id }, data: { phone } });
}

export function isAdminPhone(phone: string) {
  return phone === env.ADMIN_PHONE;
}

export function promoteToAdmin(id: string, phone: string) {
  return db.user.update({ where: { id }, data: { phone, role: "ADMIN" } });
}
