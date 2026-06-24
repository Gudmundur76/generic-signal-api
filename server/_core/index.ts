import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { weeklyAlertHandler } from "../routers/weeklyAlert";

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

  // CORS — origin: '*' in dev; switch to allowlist for production
  const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
  app.use(cors(
    ALLOWED_ORIGINS.length > 0
      ? {
          origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
            if (!origin) return cb(null, true);
            const ok = ALLOWED_ORIGINS.some(o =>
              o.includes("*") ? new RegExp(o.replace("*", ".*")).test(origin) : o === origin
            );
            ok ? cb(null, true) : cb(new Error(`CORS: ${origin} not allowed`));
          },
          methods: ["GET", "POST", "OPTIONS"],
          allowedHeaders: ["Content-Type", "Authorization"],
        }
      : { origin: "*" }
  ));

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Scheduled heartbeat callback — weekly patent alert
  app.post("/api/scheduled/weeklyAlert", weeklyAlertHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
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
