import { Hono } from "hono";
import { validateSignature, type webhook as line } from "@line/bot-sdk";
import { env } from "../env";
import { handleEvent } from "./handler";

export const webhook = new Hono();

webhook.post("/webhook", async (c) => {
  const signature = c.req.header("x-line-signature") ?? "";
  const body = await c.req.text();

  if (!validateSignature(body, env.LINE_CHANNEL_SECRET, signature)) {
    return c.text("invalid signature", 401);
  }

  const { events } = JSON.parse(body) as line.CallbackRequest;

  // ตอบ 200 ให้ LINE ไว้ก่อน แล้วค่อยประมวลผลแต่ละ event
  await Promise.all(
    events.map((ev) =>
      handleEvent(ev).catch((err) => console.error("[line] event error", err)),
    ),
  );

  return c.json({ ok: true });
});
