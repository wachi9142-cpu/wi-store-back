import { Hono } from "hono";
import { sign } from "hono/jwt";
import { z } from "zod";
import { env } from "../env";
import { normalizePhone } from "../lib/phone";

export const auth = new Hono();

// เว็บ admin ล็อกอินด้วยเบอร์แม่ + รหัสผ่านจาก env → ได้ JWT (อายุ 7 วัน)
auth.post("/login", async (c) => {
  const body = z.object({ phone: z.string(), password: z.string() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "bad request" }, 400);

  const phone = normalizePhone(body.data.phone);
  if (phone !== env.ADMIN_PHONE || body.data.password !== env.ADMIN_PASSWORD) {
    return c.json({ error: "เบอร์หรือรหัสผ่านไม่ถูกต้อง" }, 401);
  }
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const token = await sign({ sub: phone, role: "admin", exp }, env.ADMIN_API_KEY);
  return c.json({ token, exp });
});
