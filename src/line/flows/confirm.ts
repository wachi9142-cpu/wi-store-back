import type { User } from "../../generated/prisma/client";
import { env } from "../../env";
import {
  attachSlip,
  confirmOrder,
  findAwaitingPayment,
  listAdmins,
  listPendingConfirm,
  rejectOrder,
} from "../../services/order-confirm";
import { push, pushText, replyText } from "../client";
import { image, qrText, text } from "../messages";
import { orderSummaryText } from "./order";
import { issueCouponsFor, releaseCouponOfOrder } from "../../services/promotion";

// ---------- ฝั่งลูกค้า: ส่งรูปสลิป ----------

/** ลูกค้าส่งรูป → ถือเป็นสลิปของออเดอร์ที่รอชำระล่าสุด — คืน true ถ้าจัดการแล้ว */
export async function handleSlipImage(user: User, messageId: string, replyToken: string) {
  const order = await findAwaitingPayment(user.id);
  if (!order) {
    await replyText(replyToken, "ได้รับรูปแล้วค่ะ แต่ตอนนี้ไม่มีออเดอร์ที่รอชำระเงินนะคะ 🙏");
    return true;
  }

  const updated = await attachSlip(order.id, messageId);
  await replyText(
    replyToken,
    `ได้รับสลิปของออเดอร์ #${updated.orderNo} แล้วค่ะ ✅\nรอแม่ค้าตรวจสอบสักครู่นะคะ เมื่อยืนยันแล้วจะแจ้งให้ทราบทันทีค่ะ`,
  );

  await notifyAdminsPendingOrder(updated, true);
  return true;
}

type OrderForAdmin = Parameters<typeof orderSummaryText>[0] & { user: { displayName: string | null; phone: string | null } };

/** แจ้งแม่ทุกคนที่เป็น ADMIN ว่ามีออเดอร์รอยืนยัน (แนบรูปสลิปถ้ามี) + ปุ่มยืนยัน/ปฏิเสธ */
export async function notifyAdminsPendingOrder(o: OrderForAdmin, withSlip: boolean) {
  const admins = await listAdmins();
  const customer = `${o.user.displayName ?? "ลูกค้า"} (${o.user.phone ?? "-"})`;
  const head = withSlip ? "🔔 ออเดอร์ใหม่รอตรวจสลิป" : "🔔 ออเดอร์ใหม่ (ใช้คูปองครบ ยอด 0 บาท ไม่มีสลิป)";
  const prompt = withSlip ? "ตรวจสอบยอดโอนแล้วกดยืนยันได้เลยค่ะ" : "กดยืนยันเพื่อรับออเดอร์ได้เลยค่ะ";
  for (const admin of admins) {
    await push(admin.lineUserId, [
      text(`${head}\nลูกค้า: ${customer}\n${orderSummaryText(o)}`),
      ...(withSlip ? [image(`${env.PUBLIC_BASE_URL}/api/orders/${o.id}/slip.jpg`)] : []),
      text(prompt, qrText([`ยืนยัน #${o.orderNo}`, `ปฏิเสธ #${o.orderNo}`])),
    ]);
  }
}

// ---------- ฝั่งแม่: ยืนยัน / ปฏิเสธ / ดูรายการรอ ----------

/**
 * คำสั่งแม่ค้าเกี่ยวกับออเดอร์ — คืน true ถ้าจัดการแล้ว
 *   รอยืนยัน                → รายการที่รอตรวจสลิป
 *   ยืนยัน #12              → ตัดสต็อก + แจ้งลูกค้า
 *   ยืนยัน #12 บังคับ       → ยืนยันโดยไม่ตัดสต็อก
 *   ปฏิเสธ #12 [เหตุผล]     → แจ้งลูกค้า
 */
export async function handleAdminOrder(user: User, textIn: string, replyToken: string) {
  if (/^(รอยืนยัน|รอตรวจ|pending)$/i.test(textIn)) {
    const list = await listPendingConfirm();
    if (list.length === 0) return replyText(replyToken, "ไม่มีออเดอร์รอตรวจสลิปค่ะ ✨"), true;
    const body = list
      .map((o) => `#${o.orderNo} ${o.user.displayName ?? ""} ${o.total} บาท — ${o.items.map((i) => `${i.name}×${i.qty}`).join(", ")}`)
      .join("\n");
    await replyText(replyToken, `📋 รอตรวจสลิป ${list.length} รายการ\n${body}\n\nพิมพ์ "ยืนยัน #เลข" หรือ "ปฏิเสธ #เลข"`);
    return true;
  }

  const confirm = textIn.match(/^(ยืนยัน|confirm)\s*#?(\d+)\s*(บังคับ|force)?$/i);
  if (confirm) {
    const orderNo = Number(confirm[2]);
    const r = await confirmOrder(orderNo, user.id, Boolean(confirm[3]));
    if (!r.ok) {
      if (r.reason === "NOT_FOUND") await replyText(replyToken, `ไม่พบออเดอร์ #${orderNo} ค่ะ`);
      else if (r.reason === "BAD_STATUS") await replyText(replyToken, `ออเดอร์ #${orderNo} อยู่ในสถานะ ${r.status} ยืนยันไม่ได้ค่ะ`);
      else
        await replyText(
          replyToken,
          `สต็อกไม่พอสำหรับ #${orderNo}:\n${r.short!.join("\n")}\n\nเพิ่มสต็อกก่อน หรือพิมพ์ "ยืนยัน #${orderNo} บังคับ" เพื่อยืนยันโดยไม่ตัดสต็อก`,
        );
      return true;
    }
    const o = r.order!;
    await replyText(replyToken, `✅ ยืนยันออเดอร์ #${o.orderNo} แล้ว${o.stockDeducted ? " (ตัดสต็อกแล้ว)" : " (ไม่ตัดสต็อก)"}`);
    await pushText(o.user.lineUserId, `✅ แม่ค้ายืนยันออเดอร์ #${o.orderNo} แล้วค่ะ\n${orderSummaryText(o)}\n\nขอบคุณที่อุดหนุนนะคะ 🌿`);
    // สะสมยอดโปร → ออกคูปองถ้าครบเป้า
    for (const c of await issueCouponsFor(o.userId)) {
      await pushText(
        o.user.lineUserId,
        `🎉 ยินดีด้วยค่ะ! สะสมครบตามโปร "${c.promoName}"\nได้รับคูปองส่วนลด ${c.amount} บาท โค้ด: ${c.code}\nพิมพ์ "คูปอง" เพื่อดูคูปองทั้งหมด`,
      );
    }
    return true;
  }

  const reject = textIn.match(/^(ปฏิเสธ|reject)\s*#?(\d+)\s*(.*)$/i);
  if (reject) {
    const orderNo = Number(reject[2]);
    const reason = reject[3]?.trim() || undefined;
    const r = await rejectOrder(orderNo, reason);
    if (!r.ok) {
      await replyText(replyToken, r.reason === "NOT_FOUND" ? `ไม่พบออเดอร์ #${orderNo} ค่ะ` : `ออเดอร์ #${orderNo} อยู่ในสถานะ ${r.status} ปฏิเสธไม่ได้ค่ะ`);
      return true;
    }
    await releaseCouponOfOrder(r.order.id);
    await replyText(replyToken, `❌ ปฏิเสธออเดอร์ #${orderNo} แล้ว`);
    await pushText(
      r.order.user.lineUserId,
      `ขออภัยค่ะ ออเดอร์ #${orderNo} ถูกปฏิเสธ${reason ? `\nเหตุผล: ${reason}` : ""}\nหากมีข้อสงสัยติดต่อแม่ค้าได้เลยค่ะ 🙏`,
    );
    return true;
  }

  return false;
}
