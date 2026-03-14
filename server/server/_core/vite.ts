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
  app.get("/index.html", (req, res, next) => {
    const filePath = path.resolve(import.meta.dirname, "../../client/public/index.html");
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

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Servir arquivos de UDID com prioridade na produção
  app.get("/index.html", (req, res, next) => {
    const filePath = path.resolve(distPath, "index.html");
    // Se for o index.html da extração de UDID (que está na pasta public)
    // Nota: Em produção, o build do Vite coloca o index.html do React na raiz do distPath.
    // Mas nós colocamos o nosso index.html em client/public, que o Vite copia para a raiz do dist.
    // Isso pode causar conflito. Vamos renomear o arquivo no próximo passo se necessário.
    res.sendFile(filePath);
  });

  app.get("/udid.mobileconfig", (req, res, next) => {
    const filePath = path.resolve(distPath, "udid.mobileconfig");
    if (fs.existsSync(filePath)) {
      res.set("Content-Type", "application/x-apple-aspen-config");
      return res.sendFile(filePath);
    }
    next();
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
