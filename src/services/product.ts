import { db } from "../lib/db";
import type { StockReason } from "../generated/prisma/client";

export function listProducts(opts: { activeOnly?: boolean } = {}) {
  return db.product.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** หาสินค้าจากข้อความที่แม่/ลูกค้าพิมพ์ (ตัด "น้ำ" นำหน้า, ไม่สนช่องว่าง, match แบบ contains) */
export async function findProductByText(text: string) {
  const products = await listProducts();
  const norm = (s: string) => s.replace(/\s+/g, "").replace(/^น้ำ/, "").toLowerCase();
  const q = norm(text);
  if (!q) return null;

  return (
    products.find((p) => norm(p.name) === q) ??
    products.find((p) => norm(p.name).includes(q) || q.includes(norm(p.name))) ??
    null
  );
}

export async function adjustStock(opts: {
  productId: string;
  delta?: number; // บวก/ลบจากยอดเดิม
  set?: number; // ตั้งค่าตรง ๆ (ใช้แทน delta)
  reason: StockReason;
  note?: string;
  byUserId?: string;
}) {
  return db.$transaction(async (tx) => {
    const p = await tx.product.findUniqueOrThrow({ where: { id: opts.productId } });
    const after = opts.set !== undefined ? opts.set : p.stock + (opts.delta ?? 0);
    if (after < 0) throw new Error(`สต็อก ${p.name} ไม่พอ (เหลือ ${p.stock})`);

    const updated = await tx.product.update({ where: { id: p.id }, data: { stock: after } });
    await tx.stockLog.create({
      data: {
        productId: p.id,
        delta: after - p.stock,
        after,
        reason: opts.reason,
        note: opts.note,
        byUserId: opts.byUserId,
      },
    });
    return updated;
  });
}
