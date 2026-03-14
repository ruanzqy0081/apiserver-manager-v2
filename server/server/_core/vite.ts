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


  // Servir arquivos de UDID com prioridade no desenvolvimento
  app.get("/udid.html", (req, res, next) => {
    const filePath = path.resolve(import.meta.dirname, "../../client/public/udid.html");
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    next();
  });


  app.get("/signed.mobileconfig", (req, res, next) => {
    const filePath = path.resolve(import.meta.dirname, "../../client/public/signed.mobileconfig");
    if (fs.existsSync(filePath)) {
      res.set("Content-Type", "application/x-apple-aspen-config");
      return res.sendFile(filePath);
    }
    next();
  });


  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(import.meta.dirname, "../..", "client", "index.html");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}


export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "../../dist/public");


  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find build artifacts in ${distPath}. Please build the client first.`);
  }


  // Servir signed.mobileconfig com MIME type correto em produção
  app.get("/signed.mobileconfig", (req, res, next) => {
    const filePath = path.resolve(distPath, "signed.mobileconfig");
    if (fs.existsSync(filePath)) {
