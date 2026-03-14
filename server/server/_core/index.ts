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

  // Rota para baixar o perfil dinamicamente
  app.get("/install", (req, res) => {
    const host = req.get("host");
    const protocol = req.protocol;
    const callbackUrl = `${protocol}://${host}/udid`;

    const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <dict>
        <key>URL</key>
        <string>${callbackUrl}</string>
        <key>DeviceAttributes</key>
        <array>
            <string>UDID</string>
            <string>IMEI</string>
            <string>ICCID</string>
            <string>VERSION</string>
            <string>PRODUCT</string>
        </array>
    </dict>
    <key>PayloadOrganization</key>
    <string>Ruan Dev</string>
    <key>PayloadDisplayName</key>
    <string>Extração de UDID</string>
    <key>PayloadDescription</key>
    <string>Este perfil extrai o UDID do seu dispositivo para registro no sistema.</string>
    <key>PayloadType</key>
    <string>Profile Service</string>
    <key>PayloadIdentifier</key>
    <string>com.ruandev.udid.config</string>
    <key>PayloadUUID</key>
    <string>9CF4242B-B1CC-452D-88FA-331C5477E721</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`;

    res.set("Content-Type", "application/x-apple-aspen-config");
    res.set("Content-Disposition", 'attachment; filename="udid.mobileconfig"');
    res.send(profile);
  });

  app.use("/udid", express.raw({ type: "*/*" }));

  app.post("/udid", async (req, res) => {
    try {
      const data = req.body.toString("binary");
      console.log("Recebendo dados do iOS...");
      
      const udid = data.match(/<key>UDID<\/key>\s*<string>(.*?)<\/string>/)?.[1];
      const product = data.match(/<key>PRODUCT<\/key>\s*<string>(.*?)<\/string>/)?.[1];
      const version = data.match(/<key>VERSION<\/key>\s*<string>(.*?)<\/string>/)?.[1];

      if (udid) {
        console.log(`UDID Extraído: ${udid} para o dispositivo ${product}`);
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
        // Redireciona o usuário de volta para a aba de devices do site
        const host = req.get("host");
        res.status(301).redirect(`https://${host}/devices?udid=${udid}`);
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
