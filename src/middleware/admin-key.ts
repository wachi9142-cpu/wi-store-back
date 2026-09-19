import { createMiddleware } from "hono/factory";
import { env } from "../env";

/** ป้องกัน REST API ที่หน้าเว็บ admin เรียก — ต้องส่ง header x-admin-key */
export const adminKey = createMiddleware(async (c, next) => {
  if (c.req.header("x-admin-key") !== env.ADMIN_API_KEY) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});
