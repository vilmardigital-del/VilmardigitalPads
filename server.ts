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

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
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
    res.json({ success: true });
  });

  // 5. Proxy audio streaming from Google Drive without CORS restrictions
  app.get('/api/drive-stream/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    if (!fileId) {
      return res.status(400).send('ID do arquivo ausente');
    }

    try {
      const range = req.headers.range;
      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };
      if (range) {
        fetchHeaders['Range'] = range;
      }

      // Try Google Drive direct export URL with redirect following
      const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      let upstreamRes = await fetch(driveUrl, {
        headers: fetchHeaders,
        redirect: 'follow',
      });

      const contentType = upstreamRes.headers.get('content-type') || '';
      // If HTML warning returned (large file or virus scan interstitial), try alternate direct media URL
      if (contentType.includes('text/html')) {
        let apiKey = process.env.GEMINI_API_KEY || '';
        try {
          const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.apiKey) apiKey = config.apiKey;
          }
        } catch {}

        if (apiKey) {
          upstreamRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`,
            {
              headers: fetchHeaders,
            }
          );
        }
      }

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return res.status(upstreamRes.status).send('Áudio indisponível no Google Drive');
      }

      res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (upstreamRes.headers.get('content-range')) {
        res.setHeader('Content-Range', upstreamRes.headers.get('content-range')!);
      }
      if (upstreamRes.headers.get('content-length')) {
        res.setHeader('Content-Length', upstreamRes.headers.get('content-length')!);
      }

      res.status(upstreamRes.status);

      if (upstreamRes.body) {
        const reader = upstreamRes.body.getReader();
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
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
