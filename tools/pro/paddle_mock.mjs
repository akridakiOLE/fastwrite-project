// KM-PRO-F5 · ΨΕΥΤΙΚΑ γεγονότα Paddle Billing, υπογεγραμμένα ΟΠΩΣ η Paddle (developer.paddle.com/webhooks/about/
// signature-verification, 15/10/2026): «Paddle-Signature: ts=<unix>;h1=<hex HMAC-SHA256(secret, ts + ":" + σώμα)>».
// Χωρίς λογαριασμό Paddle: το μυστικό είναι ΔΙΚΟ μας (staging: secrets\paddle_staging_whsec.txt, εκτός git).
//   node tools/pro/paddle_mock.mjs <base> <secretFile> <event_type> <sub_id> <status> <email> [ends_at]
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let seq = 0;
export function paddleEvent(type, data, at) {
  return { event_id: "evt_" + Date.now().toString(36) + randomBytes(6).toString("hex") + (seq++),
           event_type: type, occurred_at: at || new Date(Date.now() + seq).toISOString(), notification_id: "ntf_mock", data };
}
export function paddleSub(id, status, email, o = {}) {
  return { id, status, customer_id: o.cid || "ctm_mock" + id.slice(4, 12), custom_data: email ? { km_email: email } : null,
           current_billing_period: status === "canceled" ? null : { starts_at: new Date().toISOString(), ends_at: o.ends || new Date(Date.now() + 30 * 864e5).toISOString() },
           scheduled_change: null, next_billed_at: null, items: [{ price: { id: "pri_mockpro" } }] };
}
export async function paddleSend(base, secret, ev, o = {}) {
  const raw = JSON.stringify(ev), ts = String(o.ts || Math.floor(Date.now() / 1000));
  const sig = o.sig !== undefined ? o.sig : "ts=" + ts + ";h1=" + createHmac("sha256", secret).update(ts + ":" + raw).digest("hex");
  const r = await fetch(base + "/api/km/pro/paddle/webhook", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, sig ? { "Paddle-Signature": sig } : {}), body: raw });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [base, sf, type, sub, status, email, ends] = process.argv.slice(2);
  const secret = readFileSync(sf, "utf8").trim();
  const r = await paddleSend(base, secret, paddleEvent(type, paddleSub(sub, status, email, { ends })));
  console.log(r.status, JSON.stringify(r.j));
  process.exit(r.status === 200 ? 0 : 1);
}
