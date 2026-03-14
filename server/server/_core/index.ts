import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
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

  // Rota explícita para udid.html
  app.get("/udid.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "client/public/udid.html"));
  });

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
    <string>E51066D7-802B-42E0-B020-343515395508</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`;

    res.setHeader("Content-Type", "application/x-apple-aspen-config");
    res.setHeader("Content-Disposition", 'attachment; filename="udid.mobileconfig"');
    res.send(profile);
  });

  // Rota para receber o UDID do iOS
  app.post("/udid", async (req, res) => {
    try {
      const body = req.body.toString();
      const udidMatch = body.match(/<key>UDID<\/key>\s*<string>([^<]+)<\/string>/);
      const productMatch = body.match(/<key>PRODUCT<\/key>\s*<string>([^<]+)<\/string>/);
      const versionMatch = body.match(/<key>VERSION<\/key>\s*<string>([^<]+)<\/string>/);

      const udid = udidMatch ? udidMatch[1] : "Desconhecido";
      const model = productMatch ? productMatch[1] : "iPhone";
      const version = versionMatch ? versionMatch[1] : "iOS";

      console.log(`UDID Recebido: ${udid}, Modelo: ${model}, Versão: ${version}`);

      const db = await getDb();
      await db.insert(devices).values({
        udid: udid,
        model: model,
        osVersion: version,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      res.status(301).redirect("/udid.html?success=true&udid=" + udid);
    } catch (error) {
      console.error("Erro ao processar UDID:", error);
      res.status(500).send("Erro interno ao processar UDID");
    }
  });

  registerOAuthRoutes(app);
  registerLocalAuthRoutes(app);

  app.use("/api", createExpressMiddleware({
    router: appRouter,
    createContext,
  }));

  if (process.env.NODE_ENV === "development") {
    await setupVite(app);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT) : await findAvailablePort(3000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch(console.error);
