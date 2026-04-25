import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

app.get('/api/admin/users', async (req, res) => {
  if (supabaseAdmin) {
     try {
       const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
       if (error) return res.status(500).json({ error: error.message });
       return res.json({ users });
     } catch (error: any) {
       return res.status(500).json({ error: error.message });
     }
  } else {
     return res.status(500).json({ error: "Supabase service key not configured" });
  }
});

app.post('/api/admin/updatesettings', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase service key not configured" });
  const { userId, plan, status, expiresAt } = req.body;
  
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('app_settings')
      .select('id')
      .eq('user_id', userId)
      .single();
      
    if (existing) {
      const { error } = await supabaseAdmin
        .from('app_settings')
        .update({
          subscription_plan: plan,
          subscription_status: status,
          subscription_expires_at: expiresAt
        })
        .eq('user_id', userId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('app_settings')
        .insert({
          user_id: userId,
          subscription_plan: plan,
          subscription_status: status,
          subscription_expires_at: expiresAt,
          theme: 'dark',
          language: 'pt-BR',
          autoplay_next: true,
          show_logos: true
        });
      if (error) throw error;
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/referrals', async (req, res) => {
  const { userId } = req.query;
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase admin not configured" });
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;

    const userList = users as any[];
    const referredUsers = userList.filter(u => u.user_metadata?.referred_by === userId);
    const count = referredUsers.length;
    const credits = count * 3;
    const freeMonths = Math.floor(count / 5);

    const { data: pendingReq } = await supabaseAdmin
      .from('referral_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');

    res.json({ count, credits, freeMonths, pending: pendingReq?.length ? pendingReq[0] : null });
  } catch (err: any) {
    if (err.code === '42P01') {
       return res.json({ count: 0, credits: 0, freeMonths: 0, pending: null, error: 'Table referral_requests missing' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referrals/redeem', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase admin not configured" });
  const { userId, count, credits, freeMonths } = req.body;
  try {
    const { data: { user }, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (uErr) throw uErr;

    const { error } = await supabaseAdmin.from('referral_requests').insert({
      user_id: userId,
      email: user.email,
      whatsapp: user.user_metadata?.whatsapp || '',
      referral_count: count,
      credits,
      free_months: freeMonths,
      status: 'pending'
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/referrals/requests', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase admin not configured" });
  try {
    const { data, error } = await supabaseAdmin.from('referral_requests').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ requests: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/referrals/approve', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase admin not configured" });
  const { requestId, status } = req.body;
  try {
    const { error } = await supabaseAdmin.from('referral_requests').update({ status }).eq('id', requestId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments/create-preference', async (req, res) => {
  const { title, price, planId, userId, email } = req.body;
  const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!mpToken) return res.status(500).json({ error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado.' });
  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const preference = new Preference(client);
    const APP_URL = process.env.APP_URL || `https://${req.headers.host}`;
    const response = await preference.create({
      body: {
        items: [{ id: planId, title: title, quantity: 1, unit_price: Number(price), currency_id: 'BRL' }],
        payer: { email: email || 'test@test.com' },
        back_urls: {
          success: `${APP_URL}/menu?payment=success&plan=${planId}`,
          failure: `${APP_URL}/menu?payment=failure`,
          pending: `${APP_URL}/menu?payment=pending`
        },
        auto_return: 'approved',
        external_reference: `${userId}_${planId}_${Date.now()}`,
        payment_methods: { excluded_payment_methods: [], excluded_payment_types: [], installments: 1 }
      }
    });
    res.json({ id: response.id, init_point: response.init_point });
  } catch (error: any) {
    console.error('Erro MP:', error);
    res.status(500).json({ error: 'Erro MP', details: error.message });
  }
});

app.post('/api/payments/create-payment', async (req, res) => {
  const { title, price, planId, userId, email, method, payer, token, installments, payment_method_id, issuer_id } = req.body;
  const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!mpToken) return res.status(500).json({ error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado.' });
  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const payment = new Payment(client);
    const response = await payment.create({
      body: {
        transaction_amount: Number(price),
        description: title,
        payment_method_id: method || payment_method_id,
        token: token,
        installments: installments || 1,
        issuer_id: issuer_id,
        external_reference: `${userId}_${planId}_${Date.now()}`,
        payer: { ...payer, email: email || payer?.email || 'user@example.com' }
      },
      requestOptions: { idempotencyKey: `${userId}_${planId}_${Date.now()}_${Math.random()}` }
    });
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro MP Direto', details: error.message });
  }
});

app.post('/api/payments/webhook', async (req, res) => {
  const paymentId = req.query.id || req.body?.data?.id;
  const type = req.query.topic || req.body?.type;
  if (type === 'payment' && paymentId) {
    try {
      const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (!mpToken) return res.status(200).send('No token');
      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpToken}` }
      });
      const payment = response.data;
      if (payment.status === 'approved') {
        const extRef = payment.external_reference;
        if (extRef && supabaseAdmin) {
          const [userId, planId] = extRef.split('_');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await supabaseAdmin.from('app_settings').update({ 
            subscription_plan: planId, 
            subscription_status: 'active',
            subscription_expires_at: expiresAt.toISOString()
          }).eq('user_id', userId);
        }
      }
    } catch (error) {}
  }
  res.status(200).send('OK');
});

// Notifications
app.post('/api/notifications/send', async (req, res) => {
  const { title, message, imageUrl, data } = req.body;
  const appId = process.env.VITE_ONESIGNAL_APP_ID || '581f23c1-2b57-4646-8780-6cd2ccbba30e';
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!restApiKey) return res.status(500).json({ error: 'Sem key' });
  try {
    const response = await axios.post('https://onesignal.com/api/v1/notifications', {
      app_id: appId,
      included_segments: ['All'],
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      big_picture: imageUrl,
      chrome_web_image: imageUrl,
      data: data || {},
    }, { headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restApiKey}` } });
    res.json({ success: true, data: response.data });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro OneSignal' });
  }
});

app.post('/api/terabox/convert', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL do TeraBox é obrigatória.' });

  if (url.includes('player.kingx.dev/#')) {
    const hash = url.split('#')[1];
    if (hash) {
      const params = new URLSearchParams(hash);
      return res.json({ 
        success: true, 
        directUrl: url,
        videoUrl: params.get('video_url') ? decodeURIComponent(params.get('video_url') as string) : null,
        subtitleUrl: params.get('subtitle_url') ? decodeURIComponent(params.get('subtitle_url') as string) : null
      });
    }
  }

  try {
    res.status(404).json({ error: 'Conversão online em Vercel limitada.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro TeraBox' });
  }
});

export default app;
