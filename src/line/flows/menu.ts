import { listProducts } from "../../services/product";
import { replyText } from "../client";

export async function menuText() {
  const products = await listProducts({ activeOnly: true });
  if (products.length === 0) return "วันนี้ยังไม่มีเมนูค่ะ รอแม่ค้าแจ้งสักครู่นะคะ 🙏";
  return (
    "🌿 เมนูวันนี้\n" +
    products
      .map((p) => `• ${p.name} ${p.price} บาท/${p.unit}${p.stock > 0 ? ` (เหลือ ${p.stock})` : " — หมด"}`)
      .join("\n") +
    "\n\nสั่งได้เลย เช่น \"เก็กฮวย 2 ขวด\""
  );
}

/** ลูกค้า/แม่ พิมพ์ "เมนู" — คืน true ถ้าจัดการแล้ว */
export async function handleMenu(text: string, replyToken: string) {
  if (!/^(เมนู|menu|มีอะไรบ้าง|วันนี้มีอะไร)$/i.test(text)) return false;
  await replyText(replyToken, await menuText());
  return true;
}
