import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import * as db from "../db";

export function registerLocalAuthRoutes(app: Express) {
  // POST /api/auth/login - Login local com admin/admin123
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;

    // Credenciais de teste: admin/admin123
    if (username === "admin" && password === "admin123") {
      try {
        // Criar ou atualizar usuário admin no banco
        await db.upsertUser({
          openId: "test-admin-local",
          name: "Administrador",
          email: "admin@test.local",
          loginMethod: "local",
          role: "admin",
          lastSignedIn: new Date(),
        });

        // Criar token de sessão
        const sessionToken = await sdk.createSessionToken("test-admin-local", {
          name: "Administrador",
          expiresInMs: ONE_YEAR_MS,
        });

        // Salvar cookie de sessão
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return res.json({ success: true });
      } catch (error) {
        console.error("[LocalAuth] Login failed", error);
        return res.status(500).json({ error: "Login falhou" });
      }
    }

    // Credenciais inválidas
    return res.status(401).json({ error: "Credenciais inválidas" });
  });

  // POST /api/auth/logout - Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.json({ success: true });
  });
}
