import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { appRouter } from "./routers";
import { createContext } from "./trpc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3000");

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "16mb" }));

// tRPC
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => createContext(req, res),
  })
);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve static files — always serve the built client if it exists
const clientDir = path.resolve(__dirname, "../dist/client");
const clientDirAlt = path.resolve(process.cwd(), "dist/client");
const serveDir = fs.existsSync(clientDir) ? clientDir : clientDirAlt;
if (fs.existsSync(serveDir)) {
  app.use(express.static(serveDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(serveDir, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export type { AppRouter } from "./routers";
