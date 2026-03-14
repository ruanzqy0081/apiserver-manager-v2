import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes } from "./localAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import { devices } from "../../drizzle/schema";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use("/udid", express.raw({ type: "*/*" }));

  app.post("/udid", async (req, res) => {
    try {
      const data = req.body.toString("binary");
      const udid = data.match(/<key>UDID<\/key>\s*<string>(.*?)<\/string>/)?.[1];
      const product = data.match(/<key>PRODUCT<\/key>\s*<string>(.*?)<\/string>/)?.[1];
      const version = data.match(/<key>VERSION<\/key>\s*<string>(.*?)<\/string>/)?.[1];

      if (udid) {
        const db = await getDb();
        if (db) {
          await db.insert(devices).values({
            udid: udid,
            name: `${product || "iPhone"} (iOS ${version || "Unknown"})`,
            status: "online",
            lastSeen: new Date(),
          }).onDuplicateKeyUpdate({
            set: { lastSeen: new Date(), status: "online" }
          });
        }
        res.send(`<html><body style="font-family:sans-serif;text-align:center;margin-top:40px;"><h2>Device Registered</h2><p>UDID: ${udid}</p><p>Device: ${product}</p><p>iOS: ${version}</p></body></html>`);
      } else {
        res.status(400).send("Não foi possível extrair o UDID.");
      }
    } catch (error) {
      console.error("Erro ao extrair UDID:", error);
      res.status(500).send("Erro interno do servidor.");
    }
  });

  registerOAuthRoutes(app);
  registerLocalAuthRoutes(app);

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
