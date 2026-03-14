import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

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
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Rota para receber o POST do MobileConfig
  app.post("/udid", express.raw({ type: "*/*" }), (req, res) => {
    const data = req.body.toString();
    const udidMatch = data.match(/<key>UDID<\/key>\s*<string>([^<]+)<\/string>/);
    const udid = udidMatch ? udidMatch[1] : "unknown";
    console.log("UDID Recebido:", udid);
    // Redireciona para a página de dispositivos com o UDID capturado
    res.writeHead(301, { Location: `https://apiserver-manager-v2-production.up.railway.app/devices?udid=${udid}` });
    res.end();
  });

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientPath = path.resolve(import.meta.dirname, "../../client");
      const templatePath = path.resolve(clientPath, "index.html");
      let template = fs.readFileSync(templatePath, "utf-8");

      template = await vite.transformIndexHtml(url, template);

      const html = template.replace(`<!--app-head-->`, "");

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "../../client/dist");
  const publicPath = path.resolve(import.meta.dirname, "../../client/public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      "Could not find build artifacts in client/dist. Did you forget to run 'pnpm run build'?",
    );
  }

  // Servir arquivos de UDID com prioridade máxima em produção
  app.get("/udid.html", (req, res) => {
    res.sendFile(path.resolve(publicPath, "udid.html"));
  });

  app.get("/udid.mobileconfig", (req, res) => {
    res.set("Content-Type", "application/x-apple-aspen-config");
    res.sendFile(path.resolve(publicPath, "udid.mobileconfig"));
  });

  // Rota para receber o POST do MobileConfig em produção
  app.post("/udid", express.raw({ type: "*/*" }), (req, res) => {
    const data = req.body.toString();
    const udidMatch = data.match(/<key>UDID<\/key>\s*<string>([^<]+)<\/string>/);
    const udid = udidMatch ? udidMatch[1] : "unknown";
    console.log("UDID Recebido (Prod):", udid);
    res.writeHead(301, { Location: `https://apiserver-manager-v2-production.up.railway.app/devices?udid=${udid}` });
    res.end();
  });

  app.use(express.static(distPath, { index: false }));

  app.use("*", async (_req, res) => {
    try {
      const templatePath = path.resolve(distPath, "index.html");
      const template = fs.readFileSync(templatePath, "utf-8");
      const html = template.replace(`<!--app-head-->`, "");

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      res.status(500).end((e as Error).message);
    }
  });
}
