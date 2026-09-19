import { messagingApi } from "@line/bot-sdk";
import { env } from "../env";

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
});

export const lineBlobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
});

function dryLog(prefix: string, messages: messagingApi.Message[]) {
  for (const m of messages) {
    const body = m.type === "text" ? m.text : `<${m.type}> ${"originalContentUrl" in m ? m.originalContentUrl : ""}`;
    const qr = "quickReply" in m && m.quickReply ? `\n  [ปุ่ม: ${(m.quickReply.items ?? []).map((i) => i.action?.label).join(" | ")}]` : "";
    console.log(`[line:dry-run] ${prefix} -> ${body}${qr}`);
  }
}

export async function reply(replyToken: string, messages: messagingApi.Message[]) {
  if (env.LINE_DRY_RUN) return dryLog("reply", messages);
  await lineClient.replyMessage({ replyToken, messages });
}

export function replyText(replyToken: string, text: string) {
  return reply(replyToken, [{ type: "text", text }]);
}

export async function push(lineUserId: string, messages: messagingApi.Message[]) {
  if (env.LINE_DRY_RUN) return dryLog(`push(${lineUserId})`, messages);
  await lineClient.pushMessage({ to: lineUserId, messages });
}

export function pushText(lineUserId: string, text: string) {
  return push(lineUserId, [{ type: "text", text }]);
}
