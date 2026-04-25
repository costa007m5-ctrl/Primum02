import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Initialize Supabase Admin strictly for backend operations
  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  interface RoomState {
    hostId: string;
    playing: boolean;
    currentTime: number;
    movieId: number;
    users: { id: string; profileName: string; avatar: string }[];
  }

  const rooms = new Map<string, RoomState>();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ roomId, profile, movieId, isHost }) => {
      socket.join(roomId);
      
      let room = rooms.get(roomId);
      if (!room) {
        room = {
          hostId: isHost ? socket.id : '',
          playing: false,
          currentTime: 0,
          movieId,
          users: []
        };
        rooms.set(roomId, room);
      }

      if (isHost && !room.hostId) {
        room.hostId = socket.id;
      }

      const userExists = room.users.find(u => u.profileName === profile.name);
      if (!userExists) {
        room.users.push({ id: socket.id, profileName: profile.name, avatar: profile.avatar_url });
      }

      io.to(roomId).emit('room-update', room);
    });

    socket.on('sync-playback', ({ roomId, playing, currentTime }) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        room.playing = playing;
        room.currentTime = currentTime;
        socket.to(roomId).emit('playback-update', { playing, currentTime });
      }
    });

    socket.on('send-emote', ({ roomId, emote, profileName }) => {
      io.to(roomId).emit('receive-emote', { emote, profileName, id: Math.random() });
    });

    socket.on('disconnect', () => {
      rooms.forEach((room, roomId) => {
        const userIndex = room.users.findIndex(u => u.id === socket.id);
        if (userIndex !== -1) {
          room.users.splice(userIndex, 1);
          if (room.hostId === socket.id) {
            room.hostId = room.users[0]?.id || '';
          }
          if (room.users.length === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit('room-update', room);
          }
        }
      });
    });
  });

  app.use(express.json());

  // Middleware de Segurança e HTTPS
  app.use((req, res, next) => {
    // Forçar HTTPS em produção
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.get('host')}${req.url}`);
    }
    
    // Headers de Segurança para evitar avisos de "Não Seguro"
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Content Security Policy (CSP) - Ajuda a provar que o site é seguro
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https: http:; " + // Permitir imagens de qualquer lugar seguro
      "font-src 'self' https://fonts.gstatic.com; " +
      "connect-src 'self' https://*.supabase.co https://*.googleapis.com wss://*.supabase.co; " +
      "media-src 'self' https: http: blob:; " + // Permitir vídeos de qualquer lugar seguro
      "frame-src 'self' https://*.youtube.com https://*.vimeo.com https://drive.google.com;"
    );
    
    next();
  });

  app.get('/api/admin/users', async (req, res) => {
    // In a real app, verify the JWT properly!
    // We assume the caller is admin based on JWT token if we had a proper check.
    // E.g., const authHeader = req.headers.authorization;
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

  // Mercado Pago endpoints
  app.post('/api/payments/create-preference', async (req, res) => {
    const { title, price, planId, userId, email } = req.body;
    
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado.' });
    }

    try {
      const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
      const preference = new Preference(client);

      const APP_URL = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? `https://${req.get('host')}` : `http://localhost:${PORT}`);

      const response = await preference.create({
        body: {
          items: [
            {
              id: planId,
              title: title,
              quantity: 1,
              unit_price: Number(price),
              currency_id: 'BRL',
            }
          ],
          payer: {
            email: email || 'test@test.com'
          },
          back_urls: {
            success: `${APP_URL}/menu?payment=success&plan=${planId}`,
            failure: `${APP_URL}/menu?payment=failure`,
            pending: `${APP_URL}/menu?payment=pending`
          },
          auto_return: 'approved',
          external_reference: `${userId}_${planId}_${Date.now()}`,
          payment_methods: {
            excluded_payment_methods: [],
            excluded_payment_types: [],
            installments: 1
          }
        }
      });

      res.json({ id: response.id, init_point: response.init_point });
    } catch (error: any) {
      console.error('Erro ao criar preferência do Mercado Pago:', error);
      res.status(500).json({ error: 'Erro ao conectar com Mercado Pago.', details: error.message });
    }
  });

  app.post('/api/payments/webhook', async (req, res) => {
    const paymentId = req.query.id || req.body?.data?.id;
    const type = req.query.topic || req.body?.type;
    
    // Na prática, em produção você checaria o signature do webhook pra garantir que vem do MP
    
    if (type === 'payment' && paymentId) {
      try {
        if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
             return res.status(200).send('Webhook ignored: no token');
        }

        // Você precisaria fazer um GET no payment para conferir o status e liberar no banco
        // Utilizando o external_reference para achar o plano e usuario
        const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}` }
        });
        
        const payment = response.data;
        if (payment.status === 'approved') {
          // Extrair info do external_reference e atualizar o Supabase
          const extRef = payment.external_reference; // ex: userId_planId_timestamp
          if (extRef) {
            const [userId, planId] = extRef.split('_');
            console.log(`Pagamento Aprovado! Liberar plano ${planId} para user ${userId}`);
            
            // Aqui seria a integração com Supabase:
            if (supabaseAdmin) {
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 30);
              const { error } = await supabaseAdmin
                .from('app_settings')
                .update({ 
                  subscription_plan: planId, 
                  subscription_status: 'active',
                  subscription_expires_at: expiresAt.toISOString()
                })
                .eq('user_id', userId);
                
              if (error) {
                console.error("Erro ao atualizar status de assinatura no DB:", error);
              } else {
                console.log(`Assinatura ativa e estendida por 30 dias para o usuario ${userId}`);
              }
            } else {
              console.warn("SUPABASE_SERVICE_ROLE_KEY não configurada. Atualização do banco de dados ignorada no webhook.");
            }
          }
        }
      } catch (error) {
        console.error('Erro no processamento do webhook MP:', error);
      }
    }
    res.status(200).send('OK');
  });

  // Rota para enviar notificações via OneSignal
  app.post('/api/notifications/send', async (req, res) => {
    const { title, message, imageUrl, data } = req.body;
    const appId = process.env.VITE_ONESIGNAL_APP_ID || '581f23c1-2b57-4646-8780-6cd2ccbba30e';
    const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!restApiKey) {
      console.error('ERRO: ONESIGNAL_REST_API_KEY não configurada.');
      return res.status(500).json({ error: 'Configuração Pendente: Adicione a ONESIGNAL_REST_API_KEY nos Secrets.' });
    }

    try {
      const response = await axios.post(
        'https://onesignal.com/api/v1/notifications',
        {
          app_id: appId,
          included_segments: ['All'], // Envia para todos os usuários inscritos
          headings: { en: title, pt: title },
          contents: { en: message, pt: message },
          big_picture: imageUrl,
          chrome_web_image: imageUrl,
          data: data || {},
        },
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Basic ${restApiKey}`,
          },
        }
      );

      res.json({ success: true, data: response.data });
    } catch (error: any) {
      console.error('Erro ao enviar notificação OneSignal:', error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: 'Falha ao enviar notificação', 
        details: error.response?.data || error.message 
      });
    }
  });

  // Proxy para streaming do Google Drive
  // Isso ajuda a evitar problemas de CORS e esconde a API Key
  app.get('/api/stream/:fileId', async (req, res) => {
    const { fileId } = req.params;
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

    if (!apiKey || apiKey === 'your_google_drive_api_key_here') {
      console.error('ERRO: GOOGLE_DRIVE_API_KEY não configurada nos Secrets.');
      return res.status(500).send('Configuração Pendente: Adicione a GOOGLE_DRIVE_API_KEY nos Secrets do AI Studio.');
    }

    try {
      let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
      
      // Tenta detectar se o arquivo exige confirmação ou se está com cota estourada
      const checkRes = await axios.get(url, { 
        headers: { Range: 'bytes=0-10' },
        timeout: 8000,
        validateStatus: () => true 
      });

      if (checkRes.status === 403) {
        const data = JSON.stringify(checkRes.data);
        if (data.includes('downloadQuotaExceeded')) {
          console.error(`COTA EXCEDIDA: O Google bloqueou o streaming do arquivo ${fileId} por hoje.`);
          return res.status(403).json({ 
            code: 'QUOTA_EXCEEDED', 
            message: 'Este filme está muito popular hoje! O Google Drive limitou o streaming direto.' 
          });
        }
        
        // Tenta achar token de vírus se for apenas um aviso
        const confirmMatch = data.match(/confirm=([a-zA-Z0-9-_]+)/);
        if (confirmMatch) {
          url += `&confirm=${confirmMatch[1]}`;
        }
      }

      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: { Range: req.headers.range || '' },
        timeout: 60000
      });

      // Se o Google retornar um erro (mesmo que o axios não lance exceção no stream)
      if (response.status >= 400) {
        return res.status(response.status).send(`Erro do Google Drive: ${response.status}`);
      }

      const headers: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Content-Type': response.headers['content-type']?.includes('matroska') ? 'video/webm' : (response.headers['content-type'] || 'video/mp4'),
      };

      if (response.headers['content-length']) headers['Content-Length'] = response.headers['content-length'];
      if (response.headers['content-range']) headers['Content-Range'] = response.headers['content-range'];

      res.writeHead(response.status, headers);
      response.data.pipe(res);

      response.data.on('error', (err: any) => {
        console.error('Erro no stream de dados:', err.message);
        res.end();
      });

    } catch (error: any) {
      if (error.response) {
        console.error(`Erro Google API (${error.response.status}):`, error.response.data?.error?.message || error.message);
        res.status(error.response.status).send(`Erro no Google Drive: ${error.response.data?.error?.message || 'Arquivo não encontrado ou sem permissão.'}`);
      } else {
        console.error('Erro de Conexão:', error.message);
        res.status(500).send('Erro ao conectar com o Google Drive.');
      }
    }
  });

  // Google Drive OAuth Routes
  app.get('/api/auth/google/url', (req, res) => {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'VITE_GOOGLE_CLIENT_ID não configurada.' });
    }

    const APP_URL = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? `https://${req.get('host')}` : `http://localhost:${PORT}`);
    const redirectUri = `${APP_URL}/auth/google/callback`;
    
    const params = new URLSearchParams({
      client_id: process.env.VITE_GOOGLE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    res.json({ url: authUrl });
  });

  app.get(['/auth/google/callback', '/auth/google/callback/'], async (req, res) => {
    const { code } = req.query;
    const APP_URL = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? `https://${req.get('host')}` : `http://localhost:${PORT}`);
    const redirectUri = `${APP_URL}/auth/google/callback`;

    try {
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: process.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });

      const { access_token, refresh_token, expires_in } = response.data;
      
      // Get user email
      const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const { email } = userRes.data;

      const accountData = {
        email,
        access_token,
        refresh_token,
        expiry_date: Date.now() + (expires_in * 1000)
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
    } catch (error) {
      console.error('Erro no callback do Google:', error);
      res.status(500).send('Erro na autenticação com o Google Drive.');
    }
  });

  // Rota para converter links do TeraBox
  app.post('/api/terabox/convert', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL do TeraBox é obrigatória.' });

    console.log(`Iniciando conversão TeraBox para: ${url}`);

    // Se já for um link do player.kingx.dev, processa diretamente
    if (url.includes('player.kingx.dev/#')) {
      const hash = url.split('#')[1];
      if (hash) {
        const params = new URLSearchParams(hash);
        return res.json({ 
          success: true, 
          directUrl: url,
          videoUrl: params.get('video_url') ? decodeURIComponent(params.get('video_url')!) : null,
          subtitleUrl: params.get('subtitle_url') ? decodeURIComponent(params.get('subtitle_url')!) : null
        });
      }
    }

    try {
      // Tenta múltiplas fontes de conversão
      const sources = [
        // Fonte 1: teraboxdownloader.pro
        async () => {
          const converterUrl = `https://www.teraboxdownloader.pro/p/fs.html?q=${encodeURIComponent(url)}&m=1`;
          const response = await axios.get(converterUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Referer': 'https://www.teraboxdownloader.pro/'
            },
            timeout: 10000
          });
          const html = response.data;
          const kingxMatch = html.match(/https:\/\/player\.kingx\.dev\/#[^"']+/);
          const teradlMatch = html.match(/https:\/\/teradl\.kingx\.dev\/[^"']+/);
          
          if (kingxMatch || teradlMatch) {
            const directUrl = kingxMatch ? kingxMatch[0] : teradlMatch![0];
            if (teradlMatch && !kingxMatch) return { videoUrl: directUrl };
            const hash = directUrl.split('#')[1];
            if (hash) {
              const params = new URLSearchParams(hash);
              return { 
                directUrl,
                videoUrl: params.get('video_url') ? decodeURIComponent(params.get('video_url')!) : null,
                subtitleUrl: params.get('subtitle_url') ? decodeURIComponent(params.get('subtitle_url')!) : null
              };
            }
            return { directUrl };
          }
          const m3u8Match = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
          if (m3u8Match) return { videoUrl: m3u8Match[0] };
          throw new Error('Padrão não encontrado no teraboxdownloader.pro');
        },
        // Fonte 2: terabox-downloader.com (Simulação de API se possível)
        async () => {
          // Esta é uma tentativa genérica de encontrar links em sites de bypass
          const bypassUrl = `https://terabox-downloader.com/api/get-info?url=${encodeURIComponent(url)}`;
          try {
            const response = await axios.get(bypassUrl, { timeout: 8000 });
            if (response.data && response.data.stream_url) {
              return { videoUrl: response.data.stream_url };
            }
          } catch (e) {}
          throw new Error('Falha no bypass secundário');
        }
      ];

      for (const source of sources) {
        try {
          const result: any = await source();
          if (result && (result.videoUrl || result.directUrl)) {
            console.log('Conversão bem-sucedida!');
            return res.json({ success: true, ...result });
          }
        } catch (e: any) {
          console.warn(`Fonte falhou: ${e.message}`);
        }
      }

      res.status(404).json({ 
        error: 'Não foi possível converter automaticamente.', 
        details: 'Todas as fontes de conversão falharam ou retornaram links inválidos.' 
      });
    } catch (error: any) {
      console.error('Erro crítico ao converter TeraBox:', error.message);
      res.status(500).json({ 
        error: 'Erro interno ao processar o link.', 
        details: error.message 
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
