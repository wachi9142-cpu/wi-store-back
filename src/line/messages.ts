import type { messagingApi } from "@line/bot-sdk";

type Msg = messagingApi.Message;

export const text = (t: string, quickReply?: messagingApi.QuickReply): Msg =>
  quickReply ? { type: "text", text: t, quickReply } : { type: "text", text: t };

export const image = (url: string): Msg => ({
  type: "image",
  originalContentUrl: url,
  previewImageUrl: url,
});

/** ปุ่ม Quick Reply แบบส่งข้อความกลับ */
export const qrText = (labels: string[]): messagingApi.QuickReply => ({
  items: labels.map((label) => ({ type: "action", action: { type: "message", label, text: label } })),
});

export const qrLocation = (extraLabels: string[] = []): messagingApi.QuickReply => ({
  items: [
    { type: "action", action: { type: "location", label: "📍 แชร์ตำแหน่ง" } },
    ...extraLabels.map((label) => ({ type: "action" as const, action: { type: "message" as const, label, text: label } })),
  ],
});
