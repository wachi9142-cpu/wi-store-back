/** แปลงเบอร์ไทยให้เป็นรูปแบบ 0XXXXXXXXX; คืน null ถ้าไม่ใช่เบอร์ */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("66")) digits = "0" + digits.slice(2);
  if (!/^0\d{8,9}$/.test(digits)) return null;
  return digits;
}
