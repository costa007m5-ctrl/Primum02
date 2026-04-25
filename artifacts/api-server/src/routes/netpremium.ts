import { Router, type IRouter } from "express";
import axios from "axios";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin, requireUser, type AuthedRequest } from "../middleware/netpremium-auth.js";

const router: IRouter = Router();

const supabaseUrl = (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "")
  .replace(/['"]/g, "")
  .trim();
const supabaseServiceKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] || "")
  .replace(/['"]/g, "")
  .trim();
const supabaseAdmin =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

function getAppUrl(req: any): string {
  return (
    process.env["APP_URL"] ||
    (process.env["NODE_ENV"] === "production"
      ? `https://${req.get("host")}`
      : `http://${req.get("host")}`)
  );
}

router.get("/api/debug-env", (req, res) => {
  if (process.env["NODE_ENV"] === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  return res.json({
    hasUrl: !!process.env["SUPABASE_URL"] || !!process.env["VITE_SUPABASE_URL"],
    hasKey: !!process.env["SUPABASE_SERVICE_ROLE_KEY"],
    hasMPToken:
      !!process.env["MERCADO_PAGO_ACCESS_TOKEN"] || !!process.env["MERCADOPAGO_ACCESS_TOKEN"],
    NODE_ENV: process.env["NODE_ENV"],
    host: req.headers.host,
  });
});

router.get("/api/admin/users", requireAdmin, async (_req, res) => {
  if (supabaseAdmin) {
    try {
      const {
        data: { users },
        error,
      } = await supabaseAdmin.auth.admin.listUsers();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ users });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  } else {
    return res.status(500).json({ error: "Supabase service key not configured" });
  }
});

router.get("/api/referrals", requireUser, async (req: AuthedRequest, res) => {
  const { userId } = req.query;
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase service key not configured" });
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (
    !req.netpremiumUser ||
    (req.netpremiumUser.id !== userId && !req.netpremiumUser.isAdmin)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const {
      data: { users },
      error,
    } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });

    const userList = users as any[];
    const referredUsers = userList.filter((u) => u.user_metadata?.referred_by === userId);
    const count = referredUsers.length;
    const credits = count * 3;
    const freeMonths = Math.floor(count / 5);

    const { data: pendingReq } = await supabaseAdmin
      .from("referral_requests")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending");

    return res.json({
      count,
      credits,
      freeMonths,
      pending: pendingReq?.length ? pendingReq[0] : null,
    });
  } catch (error: any) {
    if (error.code === "42P01") {
      return res.json({
        count: 0,
        credits: 0,
        freeMonths: 0,
        pending: null,
        error: "Table referral_requests missing",
      });
    }
    return res.status(500).json({ error: error.message });
  }
});

router.post("/api/referrals/redeem", requireUser, async (req: AuthedRequest, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase service key not configured" });
  const { userId, count, credits, freeMonths } = req.body;
  if (
    !req.netpremiumUser ||
    (req.netpremiumUser.id !== userId && !req.netpremiumUser.isAdmin)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const {
      data: { user },
      error: uErr,
    } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (uErr) throw uErr;

    const { error } = await supabaseAdmin.from("referral_requests").insert({
      user_id: userId,
      email: user?.email,
      whatsapp: user?.user_metadata?.["whatsapp"] || "",
      referral_count: count,
      credits,
      free_months: freeMonths,
      status: "pending",
    });
    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/referrals/requests", requireAdmin, async (_req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase service key not configured" });
  try {
    const { data, error } = await supabaseAdmin
      .from("referral_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ requests: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/referrals/approve", requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase service key not configured" });
  const { requestId, status } = req.body;
  try {
    const { error } = await supabaseAdmin
      .from("referral_requests")
      .update({ status })
      .eq("id", requestId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/updatesettings", requireAdmin, async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase service key not configured" });
  const { userId, plan, status, expiresAt } = req.body;

  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const { data: existing } = await supabaseAdmin
      .from("app_settings")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("app_settings")
        .update({
          subscription_plan: plan,
          subscription_status: status,
          subscription_expires_at: expiresAt,
        })
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("app_settings").insert({
        user_id: userId,
        subscription_plan: plan,
        subscription_status: status,
        subscription_expires_at: expiresAt,
        theme: "dark",
        language: "pt-BR",
        autoplay_next: true,
        show_logos: true,
      });
      if (error) throw error;
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/api/payments/create-preference", async (req, res) => {
  const { title, price, planId, userId, email } = req.body;

  const mpToken = (
    process.env["MERCADO_PAGO_ACCESS_TOKEN"] ||
    process.env["MERCADOPAGO_ACCESS_TOKEN"] ||
    ""
  )
    .replace(/['"]/g, "")
    .trim();
  if (!mpToken) {
    return res.status(500).json({ error: "MERCADO_PAGO_ACCESS_TOKEN não configurado." });
  }

  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const preference = new Preference(client);

    const APP_URL = getAppUrl(req);

    const response = await preference.create({
      body: {
        items: [
          {
            id: planId,
            title: title,
            quantity: 1,
            unit_price: Number(price),
            currency_id: "BRL",
          },
        ],
        payer: {
          email: email || "test@test.com",
        },
        back_urls: {
          success: `${APP_URL}/menu?payment=success&plan=${planId}`,
          failure: `${APP_URL}/menu?payment=failure`,
          pending: `${APP_URL}/menu?payment=pending`,
        },
        auto_return: "approved",
        external_reference: `${userId}_${planId}_${Date.now()}`,
        notification_url: `${APP_URL}/api/payments/webhook`,
        payment_methods: {
          excluded_payment_methods: [],
          excluded_payment_types: [],
          installments: 1,
        },
      },
    });

    res.json({ id: response.id, init_point: response.init_point });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Erro ao conectar com Mercado Pago.", details: error.message });
  }
});

router.post("/api/payments/create-payment", async (req, res) => {
  const {
    title,
    price,
    planId,
    userId,
    email,
    method,
    payer,
    token,
    installments,
    payment_method_id,
    issuer_id,
  } = req.body;

  const mpToken = (
    process.env["MERCADO_PAGO_ACCESS_TOKEN"] ||
    process.env["MERCADOPAGO_ACCESS_TOKEN"] ||
    ""
  )
    .replace(/['"]/g, "")
    .trim();
  if (!mpToken) {
    return res.status(500).json({ error: "MERCADO_PAGO_ACCESS_TOKEN não configurado." });
  }

  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const payment = new Payment(client);
    const APP_URL = getAppUrl(req);

    const response = await payment.create({
      body: {
        transaction_amount: Number(price),
        description: title,
        payment_method_id: method || payment_method_id,
        token: token,
        installments: installments || 1,
        issuer_id: issuer_id,
        external_reference: `${userId}_${planId}_${Date.now()}`,
        notification_url: `${APP_URL}/api/payments/webhook`,
        payer: {
          ...payer,
          email: email || payer?.email || "user@example.com",
        },
      },
      requestOptions: { idempotencyKey: `${userId}_${planId}_${Date.now()}_${Math.random()}` },
    });

    res.json(response);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Erro ao criar pagamento direto.", details: error.message });
  }
});

router.post("/api/payments/webhook", async (req, res) => {
  const paymentId = req.query["id"] || req.body?.data?.id;
  const type = req.query["topic"] || req.body?.type;

  if (type === "payment" && paymentId) {
    try {
      const mpToken = (
        process.env["MERCADO_PAGO_ACCESS_TOKEN"] ||
        process.env["MERCADOPAGO_ACCESS_TOKEN"] ||
        ""
      )
        .replace(/['"]/g, "")
        .trim();
      if (!mpToken) {
        return res.status(200).send("Webhook ignored: no token");
      }

      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });

      const payment = response.data;
      if (payment.status === "approved") {
        const extRef = payment.external_reference;
        if (extRef) {
          const [userId, planId] = extRef.split("_");
          if (supabaseAdmin) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);
            await supabaseAdmin
              .from("app_settings")
              .update({
                subscription_plan: planId,
                subscription_status: "active",
                subscription_expires_at: expiresAt.toISOString(),
              })
              .eq("user_id", userId);
          }
        }
      }
    } catch {}
  }
  res.status(200).send("OK");
});

router.post("/api/notifications/send", async (req, res) => {
  const { title, message, imageUrl, data } = req.body;
  const appId = process.env["VITE_ONESIGNAL_APP_ID"] || "581f23c1-2b57-4646-8780-6cd2ccbba30e";
  const restApiKey = process.env["ONESIGNAL_REST_API_KEY"];

  if (!restApiKey) {
    return res
      .status(500)
      .json({ error: "Configuração Pendente: Adicione a ONESIGNAL_REST_API_KEY nos Secrets." });
  }

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
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Basic ${restApiKey}`,
        },
      },
    );

    res.json({ success: true, data: response.data });
  } catch (error: any) {
    res.status(error.response?.status || 500).json({
      error: "Falha ao enviar notificação",
      details: error.response?.data || error.message,
    });
  }
});

router.get("/api/stream/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const apiKey = process.env["GOOGLE_DRIVE_API_KEY"];

  if (!apiKey || apiKey === "your_google_drive_api_key_here") {
    return res
      .status(500)
      .send("Configuração Pendente: Adicione a GOOGLE_DRIVE_API_KEY nos Secrets.");
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
        return res.status(403).json({
          code: "QUOTA_EXCEEDED",
          message:
            "Este filme está muito popular hoje! O Google Drive limitou o streaming direto.",
        });
      }
      const confirmMatch = data.match(/confirm=([a-zA-Z0-9-_]+)/);
      if (confirmMatch) {
        url += `&confirm=${confirmMatch[1]}`;
      }
    }

    const response = await axios({
      method: "get",
      url: url,
      responseType: "stream",
      headers: { Range: (req.headers.range as string) || "" },
      timeout: 60000,
    });

    if (response.status >= 400) {
      return res.status(response.status).send(`Erro do Google Drive: ${response.status}`);
    }

    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Content-Type": response.headers["content-type"]?.includes("matroska")
        ? "video/webm"
        : response.headers["content-type"] || "video/mp4",
    };

    if (response.headers["content-length"])
      headers["Content-Length"] = response.headers["content-length"];
    if (response.headers["content-range"])
      headers["Content-Range"] = response.headers["content-range"];

    res.writeHead(response.status, headers);
    response.data.pipe(res);

    response.data.on("error", () => {
      res.end();
    });
  } catch (error: any) {
    if (error.response) {
      res
        .status(error.response.status)
        .send(
          `Erro no Google Drive: ${error.response.data?.error?.message || "Arquivo não encontrado ou sem permissão."}`,
        );
    } else {
      res.status(500).send("Erro ao conectar com o Google Drive.");
    }
  }
});

router.get("/api/auth/google/url", (req, res) => {
  const clientId = process.env["VITE_GOOGLE_CLIENT_ID"];
  if (!clientId) {
    return res.status(500).json({ error: "VITE_GOOGLE_CLIENT_ID não configurada." });
  }

  const APP_URL = getAppUrl(req);
  const redirectUri = `${APP_URL}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope:
      "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

router.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
  const { code } = req.query;
  const APP_URL = getAppUrl(req);
  const redirectUri = `${APP_URL}/auth/google/callback`;

  try {
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env["VITE_GOOGLE_CLIENT_ID"],
      client_secret: process.env["GOOGLE_CLIENT_SECRET"],
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const { access_token, refresh_token, expires_in } = response.data;

    const userRes = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { email } = userRes.data;

    const accountData = {
      email,
      access_token,
      refresh_token,
      expiry_date: Date.now() + expires_in * 1000,
    };

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_DRIVE_AUTH_SUCCESS',
                payload: ${JSON.stringify(accountData)}
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticação bem-sucedida! Você já pode fechar esta janela.</p>
        </body>
      </html>
    `);
  } catch {
    res.status(500).send("Erro na autenticação com o Google Drive.");
  }
});

router.post("/api/terabox/convert", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL do TeraBox é obrigatória." });

  if (url.includes("player.kingx.dev/#")) {
    const hash = url.split("#")[1];
    if (hash) {
      const params = new URLSearchParams(hash);
      return res.json({
        success: true,
        directUrl: url,
        videoUrl: params.get("video_url") ? decodeURIComponent(params.get("video_url")!) : null,
        subtitleUrl: params.get("subtitle_url")
          ? decodeURIComponent(params.get("subtitle_url")!)
          : null,
      });
    }
  }

  try {
    const sources = [
      async () => {
        const converterUrl = `https://www.teraboxdownloader.pro/p/fs.html?q=${encodeURIComponent(url)}&m=1`;
        const response = await axios.get(converterUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Referer: "https://www.teraboxdownloader.pro/",
          },
          timeout: 10000,
        });
        const html = response.data;
        const kingxMatch = html.match(/https:\/\/player\.kingx\.dev\/#[^"']+/);
        const teradlMatch = html.match(/https:\/\/teradl\.kingx\.dev\/[^"']+/);

        if (kingxMatch || teradlMatch) {
          const directUrl = kingxMatch ? kingxMatch[0] : teradlMatch![0];
          if (teradlMatch && !kingxMatch) return { videoUrl: directUrl };
          const hash = directUrl.split("#")[1];
          if (hash) {
            const params = new URLSearchParams(hash);
            return {
              directUrl,
              videoUrl: params.get("video_url")
                ? decodeURIComponent(params.get("video_url")!)
                : null,
              subtitleUrl: params.get("subtitle_url")
                ? decodeURIComponent(params.get("subtitle_url")!)
                : null,
            };
          }
          return { directUrl };
        }
        const m3u8Match = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
        if (m3u8Match) return { videoUrl: m3u8Match[0] };
        throw new Error("Padrão não encontrado");
      },
    ];

    for (const source of sources) {
      try {
        const result: any = await source();
        if (result && (result.videoUrl || result.directUrl)) {
          return res.json({ success: true, ...result });
        }
      } catch {}
    }

    res.status(404).json({
      error: "Não foi possível converter automaticamente.",
    });
  } catch (error: any) {
    res.status(500).json({
      error: "Erro interno ao processar o link.",
      details: error.message,
    });
  }
});

export default router;
