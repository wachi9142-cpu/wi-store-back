import type { User } from "../../generated/prisma/client";
import { adjustStock, findProductByText, listProducts } from "../../services/product";
import { replyText } from "../client";

export async function stockSummaryText() {
  const products = await listProducts();
  if (products.length === 0) return "ยังไม่มีสินค้าในระบบ — เพิ่มได้ที่หน้าเว็บค่ะ";
  return (
    "📦 สต็อกตอนนี้\n" +
    products
      .map((p) => `${p.active ? "" : "(ปิดขาย) "}${p.name}: ${p.stock} ${p.unit}`)
      .join("\n")
  );
}

/**
 * คำสั่งสต็อกของแม่ค้า — คืน true ถ้าจัดการแล้ว
 *   สต็อก                → ดูยอดคงเหลือ
 *   เก็กฮวย 30           → +30 (พิมพ์หลายบรรทัดได้ บรรทัดละสินค้า)
 *   เพิ่ม เก็กฮวย 30     → +30
 *   ลด เก็กฮวย 5         → -5
 *   ตั้ง เก็กฮวย 0       → ตั้งค่าเป็น 0
 */
export async function handleAdminStock(user: User, text: string, replyToken: string) {
  if (/^(สต็อก|สต๊อก|stock)$/i.test(text)) {
    await replyText(replyToken, await stockSummaryText());
    return true;
  }

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map(parseStockLine);
  if (parsed.some((p) => p === null)) return false; // ไม่ใช่รูปแบบสต็อก ปล่อยให้คำสั่งอื่นจัดการ

  const results: string[] = [];
  for (const line of parsed as StockLine[]) {
    const product = await findProductByText(line.name);
    if (!product) {
      results.push(`❌ ไม่พบสินค้า "${line.name}"`);
      continue;
    }
    try {
      const updated = await adjustStock({
        productId: product.id,
        ...(line.op === "set" ? { set: line.qty } : { delta: line.op === "sub" ? -line.qty : line.qty }),
        reason: line.op === "set" ? "SET" : "ADD",
        byUserId: user.id,
        note: text.length > 60 ? text.slice(0, 60) + "…" : text,
      });
      const sign = line.op === "set" ? "=" : line.op === "sub" ? "-" : "+";
      results.push(`✅ ${product.name} ${sign}${line.qty} → เหลือ ${updated.stock} ${updated.unit}`);
    } catch (e) {
      results.push(`❌ ${product.name}: ${(e as Error).message}`);
    }
  }
  await replyText(replyToken, results.join("\n"));
  return true;
}

type StockLine = { op: "add" | "sub" | "set"; name: string; qty: number };

function parseStockLine(line: string): StockLine | null {
  // [เพิ่ม|ลด|ตั้ง] <ชื่อ> <จำนวน> [หน่วย]
  const m = line.match(/^(เพิ่ม|ลด|ตั้ง|set|add|sub)?\s*(.+?)\s+(\d+)\s*(ขวด|แก้ว|ถุง|ชิ้น)?$/i);
  if (!m) return null;
  const opWord = (m[1] ?? "").toLowerCase();
  const op = opWord === "ตั้ง" || opWord === "set" ? "set" : opWord === "ลด" || opWord === "sub" ? "sub" : "add";
  return { op, name: m[2]!.trim(), qty: Number(m[3]) };
}
