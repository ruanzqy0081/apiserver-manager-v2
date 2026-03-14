import "dotenv/config";
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

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Middleware para lidar com o formato Plist do iOS
  app.use("/api/devices/extract-udid", express.raw({ type: "*/*" }));

  // Rota para extração de UDID do iOS
  app.post("/api/devices/extract-udid", async (req, res) => {
    try {
      const body = req.body.toString();
      const udidMatch = body.match(/<key>UDID<\/key>\s*<string>([^<]+)<\/string>/);
      const productMatch = body.match(/<key>PRODUCT<\/key>\s*<string>([^<]+)<\/string>/);
      const versionMatch = body.match(/<key>VERSION<\/key>\s*<string>([^<]+)<\/string>/);

      if (udidMatch && udidMatch[1]) {
        const udid = udidMatch[1];
        const name = productMatch ? productMatch[1] : "iPhone";
        const version = versionMatch ? versionMatch[1] : "Unknown";

        const db = await getDb();
        if (db) {
          await db.insert(devices).values({
            udid: udid,
            name: `${name} (iOS ${version})`,
            status: "online",
            lastSeen: new Date(),
          }).onDuplicateKeyUpdate({
            set: { 
              lastSeen: new Date(),
              status: "online"
            }
          });
        }
        res.status(301).redirect(`https://apiserver-manager-v2-production.up.railway.app/udid.html?udid=${udid}&status=success`);
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

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
