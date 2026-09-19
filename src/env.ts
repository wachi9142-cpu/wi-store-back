import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4008),
  DATABASE_URL: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  ADMIN_PHONE: z.string().min(9),
  // key สำหรับหน้าเว็บ admin เรียก REST API (header x-admin-key)
  ADMIN_API_KEY: z.string().min(8),
  // รหัสผ่านเข้าหน้าเว็บ admin (คู่กับ ADMIN_PHONE)
  ADMIN_PASSWORD: z.string().min(6),
  // ตั้ง 1 ตอน dev เพื่อไม่ยิงไป LINE จริง (แค่ log)
  LINE_DRY_RUN: z.coerce.boolean().default(false),
  // URL สาธารณะของ back (ใช้สร้างลิงก์รูป QR ให้ LINE ดึง)
  PUBLIC_BASE_URL: z.string().url().default("https://wi-store.develyst.online"),
  // โฟลเดอร์เก็บรูปสลิป
  UPLOAD_DIR: z.string().default("./uploads"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid env:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
