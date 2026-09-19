import { Hono } from "hono";
import { validateSignature, type webhook as line } from "@line/bot-sdk";
import { env } from "../env";
import { db } from "../lib/db";
import { handleEvent } from "./handler";

export const webhook = new Hono();

webhook.post("/webhook", async (c) => {
  const signature = c.req.header("x-line-signature") ?? "";
  const body = await c.req.text();

  if (!validateSignature(body, env.LINE_CHANNEL_SECRET, signature)) {
    return c.text("invalid signature", 401);
  }

  const { events } = JSON.parse(body) as line.CallbackRequest;

  await Promise.all(events.map(processEvent));
  return c.json({ ok: true });
});

/** รัน handler + บันทึก BotLog ทุก event (สำเร็จ/ล้มเหลว) */
async function processEvent(ev: line.Event) {
  const started = Date.now();
  const eventType = ev.type === "message" ? `message:${ev.message.type}` : ev.type;
  const input = ev.type === "message" && ev.message.type === "text" ? ev.message.text.slice(0, 200) : null;
  const lineUserId = ev.source?.type === "user" ? ev.source.userId ?? null : null;

  let ok = true;
  let error: string | null = null;
  try {
    await handleEvent(ev);
  } catch (err) {
    ok = false;
    error = err instanceof Error ? `${err.message}\n${err.stack ?? ""}`.slice(0, 2000) : String(err);
    console.error("[line] event error", err);
  }
  db.botLog
    .create({ data: { eventType, lineUserId, input, ok, error, durationMs: Date.now() - started } })
    .catch((e) => console.error("[botlog] write failed", e));
}
