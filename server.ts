import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Shared pads storage file path
  const dataDir = path.join(process.cwd(), 'data');
  const sharedPadsFile = path.join(dataDir, 'shared_pads.json');

  // Ensure data directory and audio directory exist
  const audioDir = path.join(dataDir, 'audio');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {}
  }
  if (!fs.existsSync(audioDir)) {
    try {
      fs.mkdirSync(audioDir, { recursive: true });
    } catch {}
  }

  // Read shared pads from disk
  function readSharedPads(): any[] {
    try {
      if (fs.existsSync(sharedPadsFile)) {
        const raw = fs.readFileSync(sharedPadsFile, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Error reading shared pads file:', err);
    }
    return [];
  }

  // Write shared pads to disk
  function writeSharedPads(pads: any[]) {
    try {
      fs.writeFileSync(sharedPadsFile, JSON.stringify(pads, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Error writing shared pads file:', err);
    }
  }

  // In-memory cache
  let sharedPadsCache = readSharedPads();

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', padsCount: sharedPadsCache.length });
  });

  // Admin info endpoint
  const ADMIN_EMAIL = 'vilmardigital@gmail.com';
  const DRIVE_FOLDER_NAME = 'MesaDePads_Audios';

  app.get('/api/admin/info', (req, res) => {
    res.json({
      adminEmail: ADMIN_EMAIL,
      driveFolder: DRIVE_FOLDER_NAME,
      sharedCount: sharedPadsCache.length,
    });
  });

  // 2. Get all shared pads for any user
  app.get('/api/pads', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(sharedPadsCache);
  });

  // 3. Save or sync pads to the shared collection
  app.post('/api/pads', (req, res) => {
    const body = req.body;
    if (Array.isArray(body)) {
      // Bulk update/replace
      sharedPadsCache = body;
      writeSharedPads(sharedPadsCache);
      return res.json({ success: true, count: sharedPadsCache.length });
    } else if (body && body.id) {
      // Single pad upsert
      const idx = sharedPadsCache.findIndex((p) => p.id === body.id);
      if (idx >= 0) {
        sharedPadsCache[idx] = body;
      } else {
        sharedPadsCache.push(body);
      }
      writeSharedPads(sharedPadsCache);
      return res.json({ success: true, pad: body });
    }
    return res.status(400).json({ error: 'Payload inválido' });
  });

  // 4. Delete pad from shared collection
  app.delete('/api/pads/:id', (req, res) => {
    const id = req.params.id;
    sharedPadsCache = sharedPadsCache.filter((p) => p.id !== id);
    writeSharedPads(sharedPadsCache);

    // Also clean up local audio file if exists
    try {
      const files = fs.readdirSync(audioDir);
      files.filter((f) => f.startsWith(`${id}.`) || f.startsWith(`drive_${id}`)).forEach((f) => {
        try { fs.unlinkSync(path.join(audioDir, f)); } catch {}
      });
    } catch {}

    res.json({ success: true });
  });

  // 5. Upload audio file directly to server disk (guarantees universal playback for all users)
  app.post('/api/upload-audio', (req, res) => {
    try {
      const { id, base64, mimeType } = req.body;
      if (!id || !base64) {
        return res.status(400).json({ error: 'id e base64 são obrigatórios' });
      }

      const ext = mimeType?.includes('wav')
        ? 'wav'
        : mimeType?.includes('ogg')
        ? 'ogg'
        : mimeType?.includes('m4a') || mimeType?.includes('mp4')
        ? 'm4a'
        : 'mp3';

      const filename = `${id}.${ext}`;
      const filePath = path.join(audioDir, filename);

      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(filePath, buffer);

      const audioUrl = `/api/audio/${id}`;
      return res.json({ success: true, audioUrl, filename });
    } catch (err: any) {
      console.error('Erro ao salvar áudio no servidor:', err);
      return res.status(500).json({ error: 'Falha ao gravar arquivo de áudio no servidor' });
    }
  });

  // 6. Universal Audio Streaming endpoint with Range support and CORS
  app.get('/api/audio/:id', (req, res) => {
    const id = req.params.id;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    try {
      const files = fs.readdirSync(audioDir);
      const matched = files.find((f) => f.startsWith(`${id}.`) || f === id);
      if (!matched) {
        return res.status(404).send('Áudio não encontrado no servidor');
      }

      const filePath = path.join(audioDir, matched);
      res.sendFile(filePath);
    } catch (err) {
      console.error('Erro ao servir áudio:', err);
      res.status(500).send('Erro interno ao ler arquivo de áudio');
    }
  });

  // 7. Cache a Google Drive file on the server using admin's OAuth token
  app.post('/api/drive-cache/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    const accessToken = req.body.accessToken;
    if (!fileId || !accessToken) {
      return res.status(400).json({ error: 'fileId e accessToken necessários' });
    }

    const cachedFilePath = path.join(audioDir, `drive_${fileId}.mp3`);
    if (fs.existsSync(cachedFilePath)) {
      return res.json({ success: true, cached: true, audioUrl: `/api/drive-stream/${fileId}` });
    }

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Falha ao baixar do Drive com token' });
      }

      const arrayBuf = await response.arrayBuffer();
      fs.writeFileSync(cachedFilePath, Buffer.from(arrayBuf));
      return res.json({ success: true, cached: true, audioUrl: `/api/drive-stream/${fileId}` });
    } catch (err: any) {
      console.error('Erro ao cachear arquivo do Drive:', err);
      return res.status(500).json({ error: err.message || 'Erro ao cachear' });
    }
  });

  // 8. Proxy audio streaming from Google Drive with local caching & CORS
  app.get('/api/drive-stream/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    if (!fileId) {
      return res.status(400).send('ID do arquivo ausente');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    // If cached file already exists on server disk, serve immediately
    const cachedFilePath = path.join(audioDir, `drive_${fileId}.mp3`);
    if (fs.existsSync(cachedFilePath)) {
      return res.sendFile(cachedFilePath);
    }

    try {
      const range = req.headers.range;
      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      if (range) {
        fetchHeaders['Range'] = range;
      }

      // Try direct export URL
      const directUrls = [
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
      ];

      let upstreamRes: Response | null = null;
      for (const u of directUrls) {
        try {
          const resp = await fetch(u, {
            headers: fetchHeaders,
            redirect: 'follow',
          });
          const ct = resp.headers.get('content-type') || '';
          if (resp.ok && !ct.includes('text/html')) {
            upstreamRes = resp;
            break;
          }
        } catch {}
      }

      // Fallback: If still HTML or error, try with API key
      if (!upstreamRes || (!upstreamRes.ok && upstreamRes.status !== 206)) {
        let apiKey = process.env.GEMINI_API_KEY || '';
        try {
          const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.apiKey) apiKey = config.apiKey;
          }
        } catch {}

        if (apiKey) {
          try {
            const apiRes = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`,
              { headers: fetchHeaders }
            );
            if (apiRes.ok || apiRes.status === 206) {
              upstreamRes = apiRes;
            }
          } catch {}
        }
      }

      if (!upstreamRes || (!upstreamRes.ok && upstreamRes.status !== 206)) {
        return res.status(upstreamRes?.status || 404).send('Áudio indisponível no Google Drive');
      }

      const contentType = upstreamRes.headers.get('content-type') || 'audio/mpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');

      if (upstreamRes.headers.get('content-range')) {
        res.setHeader('Content-Range', upstreamRes.headers.get('content-range')!);
      }
      if (upstreamRes.headers.get('content-length')) {
        res.setHeader('Content-Length', upstreamRes.headers.get('content-length')!);
      }

      res.status(upstreamRes.status);

      if (upstreamRes.body) {
        const reader = upstreamRes.body.getReader();
        const chunks: Uint8Array[] = [];
        const isFull = upstreamRes.status === 200;

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
              if (isFull && value) {
                chunks.push(value);
              }
            }
            res.end();
            if (isFull && chunks.length > 0) {
              try {
                fs.writeFileSync(cachedFilePath, Buffer.concat(chunks));
              } catch {}
            }
          } catch {
            res.end();
          }
        };
        pump();
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error('Erro no streaming do Google Drive:', err);
      res.status(500).send('Erro ao transmitir áudio do Drive');
    }
  });

  // Vite middleware for development
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
