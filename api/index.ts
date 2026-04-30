// @ts-nocheck
import express, { type Request, type Response, type NextFunction } from "express";
import axios from "axios";
import dotenv from "dotenv";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use((req, res, next) => {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {}
    }
    return next();
  }
  express.json()(req, res, next);
});

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/['"]/g, "").trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/['"]/g, "").trim();
const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const SUPABASE_WEBHOOK_SECRET = (process.env.SUPABASE_WEBHOOK_SECRET || "").trim();
const ENABLE_DEBUG_ENV = process.env.ENABLE_DEBUG_ENV === "1";

async function getUserFromAuthHeader(req: Request) {
  if (!supabaseAdmin) return { user: null, error: "Supabase service key not configured" };
  const auth = (req.headers.authorization as string | undefined) || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return { user: null, error: "Missing Authorization Bearer token" };
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return { user: null, error: "Invalid or expired token" };
    return { user, error: null };
  } catch (e: any) {
    return { user: null, error: e.message || "Auth lookup failed" };
  }
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const { user, error } = await getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error });
  if (ADMIN_EMAILS.length === 0) {
    return res.status(403).json({ error: "Admin endpoints disabled. Set ADMIN_EMAILS env var to a comma-separated allowlist." });
  }
  if (!ADMIN_EMAILS.includes((user.email || "").toLowerCase())) {
    return res.status(403).json({ error: "Admin only" });
  }
  (req as any).user = user;
  next();
}

async function requireUser(req: Request, res: Response, next: NextFunction) {
  const { user, error } = await getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error });
  (req as any).user = user;
  next();
}

const router = express.Router();

router.get("/debug-env", (req, res) => {
  if (!ENABLE_DEBUG_ENV) return res.status(404).json({ error: "Not found" });
  res.json({
    hasUrl: !!process.env.SUPABASE_URL || !!process.env.VITE_SUPABASE_URL,
    hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasMPToken: !!process.env.MERCADO_PAGO_ACCESS_TOKEN || !!process.env.MERCADOPAGO_ACCESS_TOKEN,
    adminAllowlistConfigured: ADMIN_EMAILS.length > 0,
    NODE_ENV: process.env.NODE_ENV,
    host: req.headers.host,
  });
});

router.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
    const { data: settings } = await supabaseAdmin.from("app_settings").select("*");
    return res.json({ users, settings });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/admin/updatesettings", requireAdmin, async (req, res) => {
  const { userId, plan, status, expiresAt } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const expiresAtIso = expiresAt ? new Date(expiresAt).toISOString() : null;
    const { error: upsertErr } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        user_id: userId,
        subscription_plan: plan,
        subscription_status: status,
        subscription_expires_at: expiresAtIso,
        theme: "dark",
        language: "pt-BR",
        autoplay_next: true,
        show_logos: true,
      }, { onConflict: "user_id" });
    if (upsertErr) throw upsertErr;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/referrals", requireUser, async (req, res) => {
  const callerId = (req as any).user.id;
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase admin not configured" });
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    const referredUsers = (users as any[]).filter((u) => u.user_metadata?.referred_by === callerId);
    const count = referredUsers.length;
    const credits = count * 3;
    const freeMonths = Math.floor(count / 5);
    const { data: pendingReq } = await supabaseAdmin
      .from("referral_requests")
      .select("*")
      .eq("user_id", callerId)
      .eq("status", "pending");
    res.json({ count, credits, freeMonths, pending: pendingReq?.length ? pendingReq[0] : null });
  } catch (err: any) {
    if (err.code === "42P01") {
      return res.json({ count: 0, credits: 0, freeMonths: 0, pending: null, error: "Table referral_requests missing" });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post("/referrals/redeem", requireUser, async (req, res) => {
  const callerUser = (req as any).user;
  const { count, credits, freeMonths } = req.body;
  try {
    const { error } = await supabaseAdmin.from("referral_requests").insert({
      user_id: callerUser.id,
      email: callerUser.email,
      whatsapp: callerUser.user_metadata?.whatsapp || "",
      referral_count: count,
      credits,
      free_months: freeMonths,
      status: "pending",
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/admin/referrals/requests", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from("referral_requests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ requests: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/admin/referrals/approve", requireAdmin, async (req, res) => {
  const { requestId, status } = req.body;
  try {
    const { error } = await supabaseAdmin.from("referral_requests").update({ status }).eq("id", requestId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/payments/create-preference", requireUser, async (req, res) => {
  const { title, price, planId, email } = req.body;
  const callerId = (req as any).user.id;
  const mpToken = (process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "").replace(/['"]/g, "").trim();
  if (!mpToken) return res.status(500).json({ error: "MERCADO_PAGO_ACCESS_TOKEN não configurado." });
  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const preference = new Preference(client);
    const APP_URL = process.env.APP_URL || `https://${req.headers.host}`;
    const response = await preference.create({
      body: {
        items: [{ id: planId || "hub", title: title || "Assinatura", quantity: 1, unit_price: Number(price) || 15.9, currency_id: "BRL" }],
        payer: { email: email || (req as any).user.email || "test@test.com" },
        back_urls: {
          success: `${APP_URL}/menu?payment=success&plan=${planId}`,
          failure: `${APP_URL}/menu?payment=failure`,
          pending: `${APP_URL}/menu?payment=pending`,
        },
        auto_return: "approved",
        external_reference: `${callerId}_${planId}_${Date.now()}`,
        notification_url: `${APP_URL}/api/payments/webhook`,
        payment_methods: { excluded_payment_methods: [], excluded_payment_types: [], installments: 1 },
      },
    });
    res.json({ id: response.id, init_point: response.init_point });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erro criando preferência MP" });
  }
});

router.post("/payments/create-payment", requireUser, async (req, res) => {
  const { title, price, planId, email, payer, token, installments, payment_method_id, issuer_id, method } = req.body;
  const callerId = (req as any).user.id;
  const mpToken = (process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "").replace(/['"]/g, "").trim();
  if (!mpToken) return res.status(500).json({ error: "MERCADO_PAGO_ACCESS_TOKEN não configurado." });
  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const payment = new Payment(client);
    const APP_URL = process.env.APP_URL || `https://${req.headers.host}`;
    const response = await payment.create({
      body: {
        transaction_amount: Number(price) || 15.9,
        description: title || "Assinatura",
        payment_method_id: method || payment_method_id,
        token,
        installments: installments || 1,
        issuer_id,
        external_reference: `${callerId}_${planId}_${Date.now()}`,
        notification_url: `${APP_URL}/api/payments/webhook`,
        payer: { ...payer, email: email || payer?.email || (req as any).user.email || "user@example.com" },
      },
      requestOptions: { idempotencyKey: `${callerId}_${planId}_${Date.now()}_${Math.random()}` },
    });
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: "Erro MP Direto", details: error.message });
  }
});

router.post("/payments/webhook", async (req, res) => {
  const paymentId = req.query.id || req.body?.data?.id;
  const type = req.query.topic || req.body?.type;
  if (type === "payment" && paymentId) {
    try {
      const mpToken = (process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "").replace(/['"]/g, "").trim();
      if (!mpToken) return res.status(200).send("No token");
      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      const payment = response.data;
      if (payment.status === "approved" && supabaseAdmin) {
        const extRef = payment.external_reference;
        if (extRef) {
          const [userId, planId] = extRef.split("_");
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await supabaseAdmin.from("app_settings").update({
            subscription_plan: planId,
            subscription_status: "active",
            subscription_expires_at: expiresAt.toISOString(),
          }).eq("user_id", userId);
        }
      }
    } catch {}
  }
  res.status(200).send("OK");
});

router.post("/notifications/send", requireAdmin, async (req, res) => {
  const { title, message, imageUrl, data } = req.body;
  const appId = process.env.VITE_ONESIGNAL_APP_ID || "581f23c1-2b57-4646-8780-6cd2ccbba30e";
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!restApiKey) return res.status(500).json({ error: "Sem ONESIGNAL_REST_API_KEY" });
  try {
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      {
        app_id: appId,
        included_segments: ["All"],
        headings: { en: title, pt: title },
        contents: { en: message, pt: message },
        big_picture: imageUrl,
        chrome_web_image: imageUrl,
        data: data || {},
      },
      { headers: { "Content-Type": "application/json", Authorization: `Basic ${restApiKey}` } },
    );
    res.json({ success: true, data: response.data });
  } catch (error: any) {
    res.status(500).json({ error: "Erro OneSignal" });
  }
});

router.post("/webhooks/supabase/onesignal", async (req, res) => {
  if (!SUPABASE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Webhook disabled. Set SUPABASE_WEBHOOK_SECRET env var." });
  }
  const provided = (req.headers["x-webhook-secret"] || req.headers["x-supabase-webhook-secret"] || "").toString();
  if (provided !== SUPABASE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }
  const { type, table, record } = req.body;
  if (type !== "INSERT" || (table !== "movies" && table !== "series")) {
    return res.status(200).send("Ignored");
  }
  const title = record.title || record.name;
  const message = `Venha conferir o novo título que acabou de chegar.`;
  const heading = `Novo Lançamento no Netprime: ${title}!`;
  const imageUrl = record.backdrop_path
    ? (record.backdrop_path.startsWith("http") ? record.backdrop_path : `https://image.tmdb.org/t/p/w500${record.backdrop_path}`)
    : null;
  const APP_URL = process.env.APP_URL || `https://${req.headers.host}`;
  const targetUrl = `${APP_URL}/movie/${record.id}`;
  const appId = process.env.VITE_ONESIGNAL_APP_ID || "581f23c1-2b57-4646-8780-6cd2ccbba30e";
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!restApiKey) {
    return res.status(500).json({ error: "Configuração Pendente: Adicione a ONESIGNAL_REST_API_KEY nos Secrets." });
  }
  try {
    await axios.post(
      "https://onesignal.com/api/v1/notifications",
      {
        app_id: appId,
        included_segments: ["Subscribed Users", "All"],
        headings: { en: heading, pt: heading },
        contents: { en: message, pt: message },
        url: targetUrl,
        big_picture: imageUrl,
        chrome_web_image: imageUrl,
      },
      { headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Basic ${restApiKey}` } },
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Falha no webhook" });
  }
});

router.get("/stream/:fileId", requireUser, async (req, res) => {
  const { fileId } = req.params;
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return res.status(500).send("Configuração Pendente: Adicione a GOOGLE_DRIVE_API_KEY nos Secrets.");
  }
  try {
    let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
    const checkRes = await axios.get(url, {
      headers: { Range: "bytes=0-10" },
      timeout: 8000,
      validateStatus: () => true,
    });
    if (checkRes.status === 403) {
      const data = JSON.stringify(checkRes.data);
      if (data.includes("downloadQuotaExceeded")) {
        return res.status(403).json({ code: "QUOTA_EXCEEDED", message: "Este filme está muito popular hoje! O Google Drive limitou o streaming direto." });
      }
      const confirmMatch = data.match(/confirm=([a-zA-Z0-9-_]+)/);
      if (confirmMatch) url += `&confirm=${confirmMatch[1]}`;
    }
    const response = await axios({
      method: "get",
      url,
      responseType: "stream",
      headers: { Range: req.headers.range || "" },
      timeout: 60000,
    });
    if (response.status >= 400) {
      return res.status(response.status).send(`Erro do Google Drive: ${response.status}`);
    }
    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Content-Type": response.headers["content-type"]?.includes("matroska") ? "video/webm" : (response.headers["content-type"] || "video/mp4"),
    };
    if (response.headers["content-length"]) headers["Content-Length"] = response.headers["content-length"];
    if (response.headers["content-range"]) headers["Content-Range"] = response.headers["content-range"];
    res.writeHead(response.status, headers);
    response.data.pipe(res);
    response.data.on("error", () => res.end());
  } catch (error: any) {
    res.status(500).send("Erro Stream");
  }
});

router.post("/terabox/convert", requireUser, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL do TeraBox é obrigatória." });
  if (url.includes("player.kingx.dev/#")) {
    const hash = url.split("#")[1];
    if (hash) {
      const params = new URLSearchParams(hash);
      return res.json({
        success: true,
        directUrl: url,
        videoUrl: params.get("video_url") ? decodeURIComponent(params.get("video_url") as string) : null,
        subtitleUrl: params.get("subtitle_url") ? decodeURIComponent(params.get("subtitle_url") as string) : null,
      });
    }
  }
  res.status(404).json({ error: "Conversão online em Vercel limitada." });
});

app.use("/api", router);
app.use("/", router);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found in express", url: req.url, originalUrl: req.originalUrl, path: req.path });
});

export default app;
