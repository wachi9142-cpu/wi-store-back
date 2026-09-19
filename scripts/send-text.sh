#!/usr/bin/env bash
# ใช้: scripts/send-text.sh <lineUserId> "<ข้อความ>"   — จำลอง LINE ส่ง text message เข้า webhook local
set -e
SECRET=$(grep '^LINE_CHANNEL_SECRET=' .env | cut -d= -f2-)
BODY=$(node -e 'const [u,t]=process.argv.slice(1);process.stdout.write(JSON.stringify({destination:"x",events:[{type:"message",mode:"active",timestamp:0,webhookEventId:"t",deliveryContext:{isRedelivery:false},source:{type:"user",userId:u},replyToken:"dummy",message:{id:"1",type:"text",quoteToken:"q",text:t}}]}))' "$1" "$2")
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)
curl -s -X POST "${URL:-http://localhost:4008}/api/line/webhook" -H "content-type: application/json" -H "x-line-signature: $SIG" -d "$BODY"; echo
