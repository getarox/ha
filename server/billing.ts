import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { aiUsage, payments, pricing, walletLedger, wallets, neuronWallets, neuronLedger, imageDailyUsage, cloudflareDailyUsage, imagePackages } from "../drizzle/schema.js";
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
  if (![25, 100].includes(money(input.amount))) throw new Error("مبلغ الخطة غير متاح.");
  const id = cartId(input.sessionKey);
  const payload: Record<string, unknown> = {
    profile_id: Number(ENV.paytabsProfileId), tran_type: "sale", tran_class: "ecom", cart_id: id,
    cart_currency: ENV.walletCurrency, cart_amount: money(input.amount), cart_description: input.description ?? "AUREVION wallet top-up",
    callback: ENV.paytabsCallbackUrl || `${ENV.officialSiteUrl}/api/payments/callback`,
    return: ENV.paytabsReturnUrl || `${ENV.officialSiteUrl}/api/payments/return`,
    customer_details: { name: input.customer?.name ?? "AUREVION customer", email: input.customer?.email ?? "", phone: input.customer?.phone ?? "" },
  };
  const response = await fetch(`${ENV.paytabsEndpoint.replace(/\/$/, "")}/payment/request`, {
    method: "POST", headers: { Authorization: ENV.paytabsServerKey, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof result.redirect_url !== "string") {
    const upstreamMessage = String(result.message ?? result.error ?? "");
    if (/application\/octet-stream|mobile authentication|mobile key/i.test(upstreamMessage)) {
      throw new Error("مفتاح PayTabs المستخدم من نوع Mobile. أنشئ Standard Web Authentication Key من لوحة PayTabs وضعه في PAYTABS_SERVER_KEY.");
    }
    throw new Error(upstreamMessage || "تعذر إنشاء عملية الدفع.");
  }
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
  if (money(payment.amount) !== amount || String(payment.currency).toUpperCase() !== ENV.walletCurrency.toUpperCase()) throw new Error("مبلغ أو عملة الدفع لا تطابق العملية الأصلية.");
  const paid = status === "A";
  const updateResult = await db.update(payments).set({ status: paid ? "paid" : status === "C" ? "cancelled" : "failed", tranRef: String(data.tran_ref ?? data.tranRef ?? payment.tranRef ?? ""), rawResponse: JSON.stringify(data) }).where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
  const affectedRows = Number((updateResult as any)?.affectedRows ?? (updateResult as any)?.[0]?.affectedRows ?? 0);
  if (affectedRows !== 1) return { status: "duplicate", duplicate: true };
  if (!paid) return { status: "failed" };
  await db.transaction(async (tx) => {
    let wallet = (await tx.select().from(wallets).where(eq(wallets.sessionKey, payment.sessionKey)).limit(1))[0];
    if (!wallet) {
      await tx.insert(wallets).values({ sessionKey: payment.sessionKey, currency: payment.currency });
      wallet = (await tx.select().from(wallets).where(eq(wallets.sessionKey, payment.sessionKey)).limit(1))[0];
    }
    if (!wallet) throw new Error("تعذر إنشاء محفظة العميل.");
    await tx.update(wallets).set({ balance: sql`${wallets.balance} + ${amount}` }).where(eq(wallets.id, wallet.id));
    await tx.insert(walletLedger).values({ walletId: wallet.id, reference: `payment:${payment.cartId}`, type: "credit", amount: amount.toFixed(2), description: "PayTabs wallet top-up" });
  });
  return { status: "paid", balanceAdded: amount };
}

export async function chargeUsage(sessionKey: string, operation: "chat" | "image", provider: string, model: string, requestId: string) {
  const price = money(DEFAULT_PRICES[operation]);
  const db = await getDb();
  if (!db) { const current = money(memoryWallets.get(sessionKey) ?? 0); if (current < price) throw new Error("رصيد المحفظة غير كافٍ."); memoryWallets.set(sessionKey, money(current - price)); return { charged: price, remaining: money(current - price) }; }
  const wallet = (await db.select().from(wallets).where(eq(wallets.sessionKey, sessionKey)).limit(1))[0];
  if (!wallet || money(wallet.balance) < price) throw new Error("رصيد المحفظة غير كافٍ.");
  const updateResult = await db.update(wallets).set({ balance: sql`${wallets.balance} - ${price}` }).where(and(eq(wallets.id, wallet.id), sql`${wallets.balance} >= ${price}`));
  const affectedRows = Number((updateResult as any)?.affectedRows ?? (updateResult as any)?.[0]?.affectedRows ?? 0);
  if (affectedRows !== 1) throw new Error("رصيد المحفظة غير كافٍ.");
  await db.insert(walletLedger).values({ walletId: wallet.id, reference: `usage:${requestId}`, type: "debit", amount: price.toFixed(2), description: `${operation} usage` });
  await db.insert(aiUsage).values({ sessionKey, operation, provider, model, amount: price.toFixed(2), requestId });
  const updated = (await db.select().from(wallets).where(eq(wallets.id, wallet.id)).limit(1))[0];
  return { charged: price, remaining: money(updated?.balance) };
}

export function getPrice(operation: "chat" | "image") { return money(DEFAULT_PRICES[operation]); }
export async function seedPricing() { const db = await getDb(); if (!db) return; for (const [operation, price] of Object.entries(DEFAULT_PRICES)) await db.insert(pricing).values({ operation, price, currency: ENV.walletCurrency }).onDuplicateKeyUpdate({ set: { price } }); }

const utcDate = () => new Date().toISOString().slice(0, 10);
export const NEURON_PACKAGES = {
  eco: { name: "إيكو", price: 10, neurons: 272727 }, standard: { name: "ستاندر", price: 20, neurons: 545455 },
  plus: { name: "بلاص", price: 30, neurons: 818182 }, turbo: { name: "تربو", price: 40, neurons: 1090909 }, business: { name: "بزنز", price: 50, neurons: 1363636 },
} as const;
type PackageId = keyof typeof NEURON_PACKAGES;
export function packageInfo(id: string) { return Object.prototype.hasOwnProperty.call(NEURON_PACKAGES, id) ? NEURON_PACKAGES[id as PackageId] : undefined; }
function affected(r: any) { return Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? 0); }
export function validateNeuronPackageCallback(expected: { amountUsd: number | string }, data: Record<string, any>) {
 const amount=money(data.cart_amount??data.tran_total??data.cartAmount);
 const currency=String(data.cart_currency??data.currency??"").toUpperCase();
 if(money(expected.amountUsd)!==amount||currency!=="USD") throw new Error("مبلغ أو عملة الدفع لا تطابق العملية الأصلية.");
 return String(data.payment_result?.response_status??data.respStatus??"").toUpperCase();
}
export function shouldCreditNeuronPackage(currentStatus: string, updateResult: unknown) {
 return currentStatus === "pending" && affected(updateResult) === 1;
}
export async function reserveFreeImage(uid: string) {
 const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE"); const day=utcDate();
 await db.insert(imageDailyUsage).values({firebaseUid:uid,quotaDate:day,freeImagesUsed:0}).onDuplicateKeyUpdate({set:{firebaseUid:uid}});
 const r=await db.update(imageDailyUsage).set({freeImagesUsed:sql`${imageDailyUsage.freeImagesUsed} + 1`}).where(and(eq(imageDailyUsage.firebaseUid,uid),eq(imageDailyUsage.quotaDate,day),sql`${imageDailyUsage.freeImagesUsed} < 3`));
 if(affected(r)!==1) throw new Error("FREE_DAILY_QUOTA"); return day;
}
export async function releaseFreeImage(uid:string,day:string) { const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE"); await db.update(imageDailyUsage).set({freeImagesUsed:sql`GREATEST(${imageDailyUsage.freeImagesUsed} - 1, 0)`}).where(and(eq(imageDailyUsage.firebaseUid,uid),eq(imageDailyUsage.quotaDate,day))); }
export async function reserveCloudflareUsage(amount:number) {
 const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE"); const day=utcDate();
 await db.insert(cloudflareDailyUsage).values({quotaDate:day,neuronsUsed:"0"}).onDuplicateKeyUpdate({set:{quotaDate:day}});
 const r=await db.update(cloudflareDailyUsage).set({neuronsUsed:sql`${cloudflareDailyUsage.neuronsUsed} + ${amount}`}).where(and(eq(cloudflareDailyUsage.quotaDate,day),sql`${cloudflareDailyUsage.neuronsUsed} + ${amount} <= 10000`));
 if(affected(r)!==1) throw new Error("CLOUDFLARE_DAILY_CAP"); return day;
}
export async function releaseCloudflareUsage(amount:number,day:string) { const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE"); await db.update(cloudflareDailyUsage).set({neuronsUsed:sql`GREATEST(${cloudflareDailyUsage.neuronsUsed} - ${amount}, 0)`}).where(eq(cloudflareDailyUsage.quotaDate,day)); }
export async function reserveNeuronBalance(uid: string, amount: number, reference: string) {
 const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE");
 await db.insert(neuronWallets).values({firebaseUid:uid,balance:"0"}).onDuplicateKeyUpdate({set:{firebaseUid:uid}});
 return db.transaction(async tx => {
  const r=await tx.update(neuronWallets).set({balance:sql`${neuronWallets.balance} - ${amount}`}).where(and(eq(neuronWallets.firebaseUid,uid),sql`${neuronWallets.balance} >= ${amount}`));
  if(affected(r)!==1) throw new Error("INSUFFICIENT_NEURONS");
  await tx.insert(neuronLedger).values({firebaseUid:uid,reference:`img:${reference}`,type:"debit",amount:amount.toFixed(2),description:"Reserved image generation"});
  const w=(await tx.select().from(neuronWallets).where(eq(neuronWallets.firebaseUid,uid)).limit(1))[0];
  return Number(w?.balance ?? 0);
 });
}
export async function refundNeuronReservation(uid: string, amount: number, reference: string) {
 const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE");
 return db.transaction(async tx => {
  const reservation=(await tx.select().from(neuronLedger).where(eq(neuronLedger.reference,`img:${reference}`)).limit(1))[0];
  if(!reservation || reservation.type!="debit") return false;
  const refunded=(await tx.select().from(neuronLedger).where(eq(neuronLedger.reference,`img-refund:${reference}`)).limit(1))[0];
  if(refunded) return false;
  await tx.update(neuronWallets).set({balance:sql`${neuronWallets.balance} + ${amount}`}).where(eq(neuronWallets.firebaseUid,uid));
  await tx.insert(neuronLedger).values({firebaseUid:uid,reference:`img-refund:${reference}`,type:"refund",amount:amount.toFixed(2),description:"Failed image generation refund"});
  return true;
 });
}
export async function neuronBalance(uid:string) { const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE"); const w=(await db.select().from(neuronWallets).where(eq(neuronWallets.firebaseUid,uid)).limit(1))[0]; return Number(w?.balance??0); }
export async function freeImagesRemaining(uid:string) { const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE"); const row=(await db.select().from(imageDailyUsage).where(and(eq(imageDailyUsage.firebaseUid,uid),eq(imageDailyUsage.quotaDate,utcDate()))).limit(1))[0]; return Math.max(0,3-(row?.freeImagesUsed??0)); }
export async function createNeuronPackagePayment(uid:string,packageId:string,customer:{name?:string|null;email?:string|null;phone?:string|null}={}) {
 const pkg=packageInfo(packageId); if(!pkg) throw new Error("INVALID_PACKAGE"); if(!ENV.paytabsProfileId||!ENV.paytabsServerKey) throw new Error("PAYTABS_UNAVAILABLE");
 const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE"); const cart=`PKG-${randomUUID().replaceAll("-","")}`;
 await db.insert(imagePackages).values({firebaseUid:uid,cartId:cart,packageId,amountUsd:pkg.price.toFixed(2),neurons:String(pkg.neurons),status:"pending"});
 const contactEmail=customer.email&&customer.email.includes("@")?customer.email:undefined;
 const contactPhone=customer.phone??(customer.email&&!customer.email.includes("@")?customer.email:undefined);
 const payload={profile_id:Number(ENV.paytabsProfileId),tran_type:"sale",tran_class:"ecom",cart_id:cart,cart_currency:"USD",cart_amount:pkg.price,cart_description:`AUREVION ${pkg.name} Neurons`,callback:ENV.paytabsCallbackUrl||`${ENV.officialSiteUrl}/api/payments/callback`,return:ENV.paytabsReturnUrl||`${ENV.officialSiteUrl}/api/payments/return`,customer_details:{name:customer.name||"AUREVION customer",...(contactEmail?{email:contactEmail}:{}),...(contactPhone?{phone:contactPhone}:{})}};
 try {
  const response=await fetch(`${ENV.paytabsEndpoint.replace(/\/$/,"")}/payment/request`,{method:"POST",headers:{Authorization:ENV.paytabsServerKey,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  const result=await response.json().catch(()=>({})) as any;
  if(!response.ok||typeof result.redirect_url!=="string") throw new Error("PAYTABS_REQUEST_FAILED");
  return {cartId:cart,redirectUrl:result.redirect_url};
 } catch(error) {
  await db.update(imagePackages).set({status:"failed"}).where(and(eq(imagePackages.cartId,cart),eq(imagePackages.status,"pending")));
  if(error instanceof Error && error.message==="PAYTABS_REQUEST_FAILED") throw new Error("تعذر إنشاء عملية الدفع؛ تحقق من تفعيل USD في ملف PayTabs.");
  throw new Error("تعذر الاتصال بمزود الدفع.");
 }
}
export async function settleNeuronPackageCallback(data:Record<string,any>) {
 const cart=String(data.cart_id??data.cartId??"");
 if(!cart) throw new Error("بيانات callback ناقصة."); const db=await getDb(); if(!db) throw new Error("DATABASE_UNAVAILABLE");
 return db.transaction(async tx=>{ const row=(await tx.select().from(imagePackages).where(eq(imagePackages.cartId,cart)).limit(1))[0]; if(!row) throw new Error("عملية الدفع غير معروفة.");
 const status=validateNeuronPackageCallback(row,data); if(row.status!=="pending") return {status:row.status,duplicate:true};
 if(status!=="A"){await tx.update(imagePackages).set({status:status==="C"?"cancelled":"failed"}).where(and(eq(imagePackages.id,row.id),eq(imagePackages.status,"pending")));return {status:"failed"};}
 const changed=await tx.update(imagePackages).set({status:"paid"}).where(and(eq(imagePackages.id,row.id),eq(imagePackages.status,"pending"))); if(!shouldCreditNeuronPackage(row.status,changed)) return {status:"duplicate",duplicate:true};
 await tx.insert(neuronWallets).values({firebaseUid:row.firebaseUid,balance:"0"}).onDuplicateKeyUpdate({set:{firebaseUid:row.firebaseUid}});
 await tx.update(neuronWallets).set({balance:sql`${neuronWallets.balance} + ${row.neurons}`}).where(eq(neuronWallets.firebaseUid,row.firebaseUid));
 await tx.insert(neuronLedger).values({firebaseUid:row.firebaseUid,reference:`package:${cart}`,type:"credit",amount:String(row.neurons),description:`Package ${row.packageId}`}); return {status:"paid",neuronsAdded:Number(row.neurons)};
 });
}
