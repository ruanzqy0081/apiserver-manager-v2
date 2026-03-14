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


  app.get("/udid.mobileconfig", (req, res, next) => {
    const filePath = path.resolve(import.meta.dirname, "../../client/public/udid.mobileconfig");
    if (fs.existsSync(filePath)) {
      res.set("Content-Type", "application/x-apple-aspen-config");
      return res.sendFile(filePath);
    }
    next();
  });


  
app.post("/udid", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const body = req.body.toString();
    const udidMatch = body.match(/<key>UDID<\/key>\s*<string>([^<]+)<\/string>/);
    const productMatch = body.match(/<key>PRODUCT<\/key>\s*<string>([^<]+)<\/string>/);
    const versionMatch = body.match(/<key>VERSION<\/key>\s*<string>([^<]+)<\/string>/);
    
    if (udidMatch) {
      const udid = udidMatch[1];
      const name = productMatch ? productMatch[1] : "iPhone";
      const version = versionMatch ? versionMatch[1] : "Unknown";
      
      console.log(`UDID recebido: ${udid} para o dispositivo ${name} (iOS ${version})`);
      
      // Aqui você deve adicionar a lógica para salvar no seu banco de dados
      // Exemplo: await db.insert(devices).values({ udid, name, version });
      
      // Redirecionar de volta para o site com o UDID na URL para que o frontend possa mostrar
      return res.status(301).redirect(`https://apiserver-manager-v2-production.up.railway.app/devices?udid=${udid}`);
    }
    res.status(400).send("UDID não encontrado no payload");
  } catch (error) {
    console.error("Erro ao processar UDID:", error);
    res.status(500).send("Erro interno");
  }
});
\napp.use("*", async (req, res, next) => {
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


  // Servir arquivos de UDID com prioridade em produção
  app.get("/udid.html", (req, res, next) => {
    const filePath = path.resolve(distPath, "udid.html");
