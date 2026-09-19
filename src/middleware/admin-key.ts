import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { env } from "../env";

/**
 * ป้องกัน REST API ของหน้าเว็บ admin — รับได้ 2 แบบ
 *   x-admin-key: <ADMIN_API_KEY>          (สำหรับ script/ทดสอบ)
 *   Authorization: Bearer <JWT จาก /api/auth/login>
 */
export const adminKey = createMiddleware(async (c, next) => {
  if (c.req.header("x-admin-key") === env.ADMIN_API_KEY) return next();

  const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (bearer) {
    try {
      const payload = await verify(bearer, env.ADMIN_API_KEY, "HS256");
      if (payload.role === "admin") return next();
    } catch {
      // token ผิด/หมดอายุ → ตกไป 401
    }
  }
  return c.json({ error: "unauthorized" }, 401);
});
