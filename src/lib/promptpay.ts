import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

export function promptpayPng(promptpayId: string, amount: number) {
  const payload = generatePayload(promptpayId, { amount });
  return QRCode.toBuffer(payload, { type: "png", width: 512, margin: 2 });
}
