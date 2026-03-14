import express, { type Express } from 'express';
import fs from 'fs';
import { type Server } from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import viteConfig from '../../vite.config';
import { createDevice, getDeviceByUdid } from '../db';

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.post('/udid', express.raw({ type: '*/*' }), async (req, res) => {
    const data = req.body.toString();
    const udidMatch = data.match(/<key>UDID<\/key>\s*<string>([^<]+)<\/string>/);
    const udid = udidMatch ? udidMatch[1] : 'unknown';
    
    if (udid !== 'unknown') {
      try {
        const existingDevice = await getDeviceByUdid(udid);
        if (!existingDevice) {
          await createDevice({
            udid: udid,
            name: 'Dispositivo iOS',
            userId: 1
          });
        }
      } catch (error) {
        console.error('Erro:', error);
      }
    }

    res.writeHead(301, { Location: 'https://apiserver-manager-v2-production.up.railway.app/devices?udid=' + udid });
    res.end();
  });

  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientPath = path.resolve(import.meta.dirname, '../../client');
      const templatePath = path.resolve(clientPath, 'index.html');
      let template = fs.readFileSync(templatePath, 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      const html = template.replace('<!--app-head-->', '');
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, '../../client/dist');
  const publicPath = path.resolve(import.meta.dirname, '../../client/public');
  if (!fs.existsSync(distPath)) {
    throw new Error('Build artifacts not found');
  }
  app.get('/udid.html', (req, res) => {
    res.sendFile(path.resolve(publicPath, 'udid.html'));
  });
  app.get('/udid.mobileconfig', (req, res) => {
    res.set('Content-Type', 'application/x-apple-aspen-config');
    res.sendFile(path.resolve(publicPath, 'udid.mobileconfig'));
  });
  app.use(express.static(distPath, { index: false }));
  app.use('*', async (req, res) => {
    try {
      const html = fs.readFileSync(path.resolve(distPath, 'index.html'), 'utf-8');
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      res.status(500).end(e instanceof Error ? e.message : String(e));
    }
  });
}
