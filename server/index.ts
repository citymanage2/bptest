import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { createContext } from "./trpc";
import { db } from "./db";
import { blockFiles, users, processes } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { TOKEN_COSTS } from "../shared/types";

// Auto-migrate: create block_files table if not exists
async function runMigrations() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS block_files (
        id SERIAL PRIMARY KEY,
        process_id INTEGER NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
        block_id VARCHAR(255) NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        original_name VARCHAR(500) NOT NULL,
        stored_name VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS business_models (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(500) NOT NULL,
        input JSONB NOT NULL,
        output JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Also add file_upload to the enum if not already present (Postgres DDL trick)
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TYPE token_operation_type ADD VALUE IF NOT EXISTS 'file_upload';
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("[migration] block_files + business_models tables ready");
  } catch (err) {
    console.error("[migration] failed:", err);
  }
}
runMigrations();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

const app = express();
const PORT = parseInt(process.env.PORT || "3000");

// Uploads directory
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer: store with UUID filename, preserve extension
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const stored = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, stored);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// Auth helper for plain Express routes
function extractUserId(req: express.Request): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { userId: number };
    return payload.userId;
  } catch { return null; }
}

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

// ── File Upload ──────────────────────────────────────────────────────────────
// POST /api/blocks/upload  { processId, blockId } + file
app.post("/api/blocks/upload", upload.single("file"), async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) { res.status(401).json({ error: "Необходима авторизация" }); return; }
  if (!req.file) { res.status(400).json({ error: "Файл не получен" }); return; }

  const processId = parseInt(req.body.processId);
  const blockId = req.body.blockId as string;
  if (!processId || !blockId) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: "processId и blockId обязательны" });
    return;
  }

  // Verify ownership
  const process = await db.query.processes.findFirst({
    where: eq(processes.id, processId),
    with: { company: true },
  });
  if (!process || (process.company as any).userId !== userId) {
    fs.unlink(req.file.path, () => {});
    res.status(403).json({ error: "Доступ запрещён" });
    return;
  }

  // Deduct tokens
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.tokenBalance < TOKEN_COSTS.file_upload) {
    fs.unlink(req.file.path, () => {});
    res.status(402).json({ error: `Недостаточно токенов. Необходимо: ${TOKEN_COSTS.file_upload}` });
    return;
  }
  await db.update(users).set({ tokenBalance: user.tokenBalance - TOKEN_COSTS.file_upload }).where(eq(users.id, userId));

  // Save record
  const [record] = await db.insert(blockFiles).values({
    processId,
    blockId,
    userId,
    originalName: req.file.originalname,
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
  }).returning();

  res.json({ file: record });
});

// GET /api/files/:id — download a block file
app.get("/api/files/:id", async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) { res.status(401).json({ error: "Необходима авторизация" }); return; }

  const fileId = parseInt(req.params.id);
  const record = await db.query.blockFiles.findFirst({ where: eq(blockFiles.id, fileId) });
  if (!record) { res.status(404).json({ error: "Файл не найден" }); return; }

  // Verify ownership via process
  const process = await db.query.processes.findFirst({
    where: eq(processes.id, record.processId),
    with: { company: true },
  });
  if (!process || (process.company as any).userId !== userId) {
    res.status(403).json({ error: "Доступ запрещён" });
    return;
  }

  const filePath = path.join(UPLOADS_DIR, record.storedName);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Файл удалён с диска" }); return; }

  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(record.originalName)}`);
  res.setHeader("Content-Type", record.mimeType);
  res.sendFile(filePath);
});

// DELETE /api/files/:id — delete a block file
app.delete("/api/files/:id", async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) { res.status(401).json({ error: "Необходима авторизация" }); return; }

  const fileId = parseInt(req.params.id);
  const record = await db.query.blockFiles.findFirst({ where: eq(blockFiles.id, fileId) });
  if (!record) { res.status(404).json({ error: "Файл не найден" }); return; }

  // Only uploader can delete
  if (record.userId !== userId) { res.status(403).json({ error: "Доступ запрещён" }); return; }

  // Remove from disk
  const filePath = path.join(UPLOADS_DIR, record.storedName);
  try { fs.unlinkSync(filePath); } catch { /* already deleted */ }

  await db.delete(blockFiles).where(eq(blockFiles.id, fileId));
  res.json({ ok: true });
});

// GET /api/blocks/files?processId=&blockId= — list files for a block
app.get("/api/blocks/files", async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) { res.status(401).json({ error: "Необходима авторизация" }); return; }

  const processId = parseInt(req.query.processId as string);
  const blockId = req.query.blockId as string;
  if (!processId || !blockId) { res.status(400).json({ error: "processId и blockId обязательны" }); return; }

  const process = await db.query.processes.findFirst({
    where: eq(processes.id, processId),
    with: { company: true },
  });
  if (!process || (process.company as any).userId !== userId) {
    res.status(403).json({ error: "Доступ запрещён" });
    return;
  }

  const files = await db.query.blockFiles.findMany({
    where: and(eq(blockFiles.processId, processId), eq(blockFiles.blockId, blockId)),
    orderBy: blockFiles.createdAt,
  });
  res.json({ files });
});

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
