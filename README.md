# wi-store-back

Backend ของร้านน้ำเต้าหู้/น้ำสมุนไพร — LINE OA bot + REST API สำหรับหน้าเว็บแม่ค้า
**Bun + Hono + Prisma 7 (PostgreSQL) + @line/bot-sdk**

## รันในเครื่อง

```bash
bun install
cp .env.example .env        # กรอกค่าให้ครบ (ดูด้านล่าง)
bun run db:migrate          # หรือ db:deploy บน production
bun run db:generate
bun run dev                 # http://localhost:4008
```

## Environment variables

| ตัวแปร | ความหมาย |
|---|---|
| `PORT` | พอร์ต (ค่าเริ่มต้น 4008) |
| `DATABASE_URL` | PostgreSQL — **บน server ต้องใช้ `localhost:5432`** (ห้ามใช้ public IP) |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | จาก LINE Developers Console (Messaging API) |
| `ADMIN_PHONE` | เบอร์แม่ค้า — ใช้ยืนยันตัวใน LINE (`admin <เบอร์>`) และล็อกอินเว็บ |
| `ADMIN_PASSWORD` | รหัสผ่านล็อกอินเว็บ (คู่กับ ADMIN_PHONE) |
| `ADMIN_API_KEY` | key ลับสำหรับ REST API + ใช้เซ็น JWT (สุ่มยาว ๆ) |
| `PUBLIC_BASE_URL` | URL สาธารณะของ back เช่น `https://wi-store.develyst.online` — ใช้สร้างลิงก์รูป QR/สลิปให้ LINE ดึง |
| `UPLOAD_DIR` | โฟลเดอร์เก็บรูปสลิป (ค่าเริ่มต้น `./uploads`) |
| `LINE_DRY_RUN` | ตั้ง `1` ตอน dev เพื่อไม่ยิงข้อความไป LINE จริง (แค่ log) |

## LINE Webhook

ตั้งค่าใน LINE Developers Console → Messaging API → Webhook URL:

```
https://wi-store.develyst.online/api/line/webhook
```

เปิด "Use webhook" และปิด "Auto-reply messages" / "Greeting message" ของ LINE OA Manager (ให้บอทตอบเอง)

## คำสั่งใน LINE

**ลูกค้า** (ครั้งแรกบอทจะขอเบอร์โทร)
- `เมนู` — ดูน้ำที่มี ราคา คงเหลือ
- `เก็กฮวย 2 ขวด` (หลายบรรทัดได้) — สั่ง → เลือกวัน/ช่วงเวลารับ → รับเอง/จัดส่ง → ได้ QR พร้อมเพย์ → ส่งรูปสลิป
- `คูปอง` — ดูคูปอง/ยอดสะสมโปร, `ใช้คูปอง ABC123` — ใช้กับออเดอร์ที่รอโอน
- `ยกเลิก` — ยกเลิกออเดอร์ที่กำลังสั่ง

**แม่ค้า** (พิมพ์ `admin <เบอร์>` ครั้งแรกเพื่อยืนยันตัว, `ช่วยเหลือ` ดูคำสั่ง)
- `สต็อก`, `เก็กฮวย 30`, `ลด เก็กฮวย 5`, `ตั้ง เก็กฮวย 0`
- `รอยืนยัน`, `ยืนยัน #12`, `ยืนยัน #12 บังคับ` (ไม่ตัดสต็อก), `ปฏิเสธ #12 เหตุผล`
- `ปิดร้าน [ข้อความ]`, `เปิดร้าน`, `สถานะร้าน`
- `ใช้คูปอง ABC123` (ลูกค้าซื้อหน้าร้าน), `คูปอง 0812345678` (ดูของลูกค้า)

## REST API (หน้าเว็บ)

ทุก endpoint ยกเว้น public ต้องส่ง `Authorization: Bearer <JWT>` (จาก `POST /api/auth/login`) หรือ `x-admin-key`

- `GET /api/health`
- `POST /api/auth/login` `{phone, password}`
- `/api/products` CRUD, `PUT /:id/stock`, `GET /:id/stock-logs`
- `/api/settings` GET/PUT (พร้อมเพย์, พิกัดร้าน, ช่วงค่าส่ง, เปิด/ปิดร้าน)
- `/api/promotions` CRUD, `GET /coupons`
- `/api/admin/orders`, `POST /:id/confirm`, `POST /:id/reject`, `/api/admin/stats`, `/api/admin/bot-logs`, `/api/admin/users`
- public: `GET /api/orders/:id/qr.png`, `GET /api/orders/:id/slip.jpg`, `POST /api/line/webhook`

## ทดสอบ local โดยไม่ต้องใช้ LINE จริง

```bash
LINE_DRY_RUN=1 bun run dev
scripts/send-text.sh Uxxx "เมนู"          # จำลองข้อความ
scripts/send-image.sh Uxxx                 # จำลองส่งสลิป
scripts/send-location.sh Uxxx 13.75 100.5  # จำลองแชร์ตำแหน่ง
```
