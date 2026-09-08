import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { aiUsage, payments, pricing, walletLedger, wallets } from "../drizzle/schema.js";
import { ENV } from "./_core/env.js";
import { getDb } from "./db.js";

const memoryWallets = new Map<string, number>();
const DEFAULT_PRICES: Record<string, string> = { chat: ENV.chatPrice, image: ENV.imagePrice };

function money(value: unknown) { return Number(Number(value ?? 0).toFixed(2)); }
function cartId(sessionKey: string) { return `AUR-${sessionKey.slice(0, 18)}-${Date.now().toString(36)}`; }

export async function getWallet(sessionKey: string) {
  const db = await getDb();
  if (!db) return { balance: money(memoryWallets.get(sessionKey) ?? 0), currency: ENV.walletCurrency };
  const row = (await db.select().from(wallets).where(eq(wallets.sessionKey, sessionKey)).limit(1))[0];
  if (!row) {
    await db.insert(wallets).values({ sessionKey, currency: ENV.walletCurrency });
    return { balance: 0, currency: ENV.walletCurrency };
  }
  return { balance: money(row.balance), currency: row.currency };
}

export async function createPayTabsPayment(input: { sessionKey: string; amount: number; description?: string; customer?: { name?: string; email?: string; phone?: string } }) {
  if (!ENV.paytabsProfileId || !ENV.paytabsServerKey) throw new Error("PayTabs غير مفعّل على الخادم.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("مبلغ الدفع غير صالح.");
  const id = cartId(input.sessionKey);
  const payload: Record<string, unknown> = {
    profile_id: Number(ENV.paytabsProfileId), tran_type: "sale", tran_class: "ecom", cart_id: id,
    cart_currency: ENV.walletCurrency, cart_amount: money(input.amount), cart_description: input.description ?? "AUREVION wallet top-up",
    callback: ENV.paytabsCallbackUrl || `${ENV.officialSiteUrl}/api/payments/paytabs/callback`,
    return: ENV.paytabsReturnUrl || `${ENV.officialSiteUrl}/api/payments/paytabs/return`,
    customer_details: { name: input.customer?.name ?? "AUREVION customer", email: input.customer?.email ?? "", phone: input.customer?.phone ?? "" },
  };
  const response = await fetch(`${ENV.paytabsEndpoint.replace(/\/$/, "")}/payment/request`, {
    method: "POST", headers: { Authorization: ENV.paytabsServerKey, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof result.redirect_url !== "string") throw new Error(String(result.message ?? "تعذر إنشاء عملية الدفع."));
  const db = await getDb();
  if (db) await db.insert(payments).values({ sessionKey: input.sessionKey, cartId: id, tranRef: typeof result.tran_ref === "string" ? result.tran_ref : undefined, amount: money(input.amount).toFixed(2), currency: ENV.walletCurrency, redirectUrl: result.redirect_url, rawResponse: JSON.stringify(result) });
  return { cartId: id, redirectUrl: result.redirect_url, tranRef: result.tran_ref };
}

export function verifyPayTabsCallback(payload: string, signature: string | undefined) {
  if (!ENV.paytabsServerKey || !signature) return false;
  const expected = createHmac("sha256", ENV.paytabsServerKey).update(payload).digest("hex");
  const a = Buffer.from(expected, "utf8"); const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function settlePayTabsCallback(data: Record<string, any>) {
  const status = String(data.payment_result?.response_status ?? data.respStatus ?? "").toUpperCase();
  const cart = String(data.cart_id ?? data.cartId ?? "");
  const amount = money(data.cart_amount ?? data.tran_total ?? data.cartAmount);
  if (!cart || !amount) throw new Error("بيانات callback ناقصة.");
  const db = await getDb();
  if (!db) { if (status === "A") memoryWallets.set(cart, money((memoryWallets.get(cart) ?? 0) + amount)); return { status }; }
  const payment = (await db.select().from(payments).where(eq(payments.cartId, cart)).limit(1))[0];
  if (!payment) throw new Error("عملية الدفع غير معروفة.");
  if (payment.status === "paid" || payment.status === "failed" || payment.status === "cancelled") return { status: payment.status, duplicate: true };
  const paid = status === "A";
  await db.update(payments).set({ status: paid ? "paid" : status === "C" ? "cancelled" : "failed", tranRef: String(data.tran_ref ?? data.tranRef ?? payment.tranRef ?? ""), rawResponse: JSON.stringify(data) }).where(eq(payments.id, payment.id));
  if (!paid) return { status: "failed" };
  const wallet = (await db.select().from(wallets).where(eq(wallets.sessionKey, payment.sessionKey)).limit(1))[0] ?? (await db.insert(wallets).values({ sessionKey: payment.sessionKey, currency: payment.currency }).$returningId())[0];
  await db.update(wallets).set({ balance: sql`${wallets.balance} + ${amount}` }).where(eq(wallets.id, wallet.id));
  await db.insert(walletLedger).values({ walletId: wallet.id, reference: `payment:${payment.cartId}`, type: "credit", amount: amount.toFixed(2), description: "PayTabs wallet top-up" });
  return { status: "paid", balanceAdded: amount };
}

export async function chargeUsage(sessionKey: string, operation: "chat" | "image", provider: string, model: string, requestId: string) {
  const price = money(DEFAULT_PRICES[operation]);
  const db = await getDb();
  if (!db) { const current = money(memoryWallets.get(sessionKey) ?? 0); if (current < price) throw new Error("رصيد المحفظة غير كافٍ."); memoryWallets.set(sessionKey, money(current - price)); return { charged: price, remaining: money(current - price) }; }
  const wallet = (await db.select().from(wallets).where(eq(wallets.sessionKey, sessionKey)).limit(1))[0];
  if (!wallet || money(wallet.balance) < price) throw new Error("رصيد المحفظة غير كافٍ.");
  await db.update(wallets).set({ balance: sql`${wallets.balance} - ${price}` }).where(and(eq(wallets.id, wallet.id), sql`${wallets.balance} >= ${price}`));
  await db.insert(walletLedger).values({ walletId: wallet.id, reference: `usage:${requestId}`, type: "debit", amount: price.toFixed(2), description: `${operation} usage` });
  await db.insert(aiUsage).values({ sessionKey, operation, provider, model, amount: price.toFixed(2), requestId });
  const updated = (await db.select().from(wallets).where(eq(wallets.id, wallet.id)).limit(1))[0];
  return { charged: price, remaining: money(updated?.balance) };
}

export function getPrice(operation: "chat" | "image") { return money(DEFAULT_PRICES[operation]); }
export async function seedPricing() { const db = await getDb(); if (!db) return; for (const [operation, price] of Object.entries(DEFAULT_PRICES)) await db.insert(pricing).values({ operation, price, currency: ENV.walletCurrency }).onDuplicateKeyUpdate({ set: { price } }); }
