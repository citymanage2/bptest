import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { appRouter } from "./routers";
import { createContext, verifyToken } from "./trpc";
import { db } from "./db";
import { interviews, companies } from "./db/schema";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3000");

// Uploads directory
const uploadsDir = path.resolve(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "16mb" }));

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// tRPC
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => createContext(req, res),
  })
);

// File upload endpoint
app.post("/api/interview/:id/upload", upload.single("file"), async (req, res) => {
  try {
    // Auth check
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "Не авторизован" });
      return;
    }
    const userId = verifyToken(token);
    if (!userId) {
      res.status(401).json({ error: "Недействительный токен" });
      return;
    }

    const interviewId = Number(req.params.id);
    if (!interviewId) {
      res.status(400).json({ error: "Некорректный ID интервью" });
      return;
    }

    // Verify interview ownership
    const interview = await db.query.interviews.findFirst({
      where: eq(interviews.id, interviewId),
      with: { company: true },
    });
    if (!interview) {
      res.status(404).json({ error: "Интервью не найдено" });
      return;
    }
    if (interview.company.userId !== userId) {
      res.status(403).json({ error: "Доступ запрещён" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Файл не предоставлен" });
      return;
    }

    // Check existing files count
    const currentAnswers = interview.answers as Record<string, unknown>;
    const existingFiles = (currentAnswers.__files__ as Array<Record<string, unknown>>) || [];
    if (existingFiles.length >= 10) {
      // Remove uploaded file
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Максимум 10 файлов на одну анкету" });
      return;
    }

    // Build file metadata
    const fileMeta = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      storedName: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      uploadedAt: new Date().toISOString(),
    };

    // Save file metadata to interview answers
    const updatedFiles = [...existingFiles, fileMeta];
    await db
      .update(interviews)
      .set({
        answers: { ...currentAnswers, __files__: updatedFiles },
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId));

    res.json(fileMeta);
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ error: "Ошибка при загрузке файла" });
  }
});

// File delete endpoint
app.delete("/api/interview/:id/file/:fileId", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "Не авторизован" });
      return;
    }
    const userId = verifyToken(token);
    if (!userId) {
      res.status(401).json({ error: "Недействительный токен" });
      return;
    }

    const interviewId = Number(req.params.id);
    const fileId = req.params.fileId;

    const interview = await db.query.interviews.findFirst({
      where: eq(interviews.id, interviewId),
      with: { company: true },
    });
    if (!interview) {
      res.status(404).json({ error: "Интервью не найдено" });
      return;
    }
    if (interview.company.userId !== userId) {
      res.status(403).json({ error: "Доступ запрещён" });
      return;
    }

    const currentAnswers = interview.answers as Record<string, unknown>;
    const existingFiles = (currentAnswers.__files__ as Array<Record<string, string>>) || [];
    const fileToDelete = existingFiles.find((f) => f.id === fileId);

    if (fileToDelete) {
      // Remove file from disk
      const filePath = path.join(uploadsDir, fileToDelete.storedName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Update interview
      const updatedFiles = existingFiles.filter((f) => f.id !== fileId);
      await db
        .update(interviews)
        .set({
          answers: { ...currentAnswers, __files__: updatedFiles },
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, interviewId));
    }

    res.json({ success: true });
  } catch (error) {
    console.error("File delete error:", error);
    res.status(500).json({ error: "Ошибка при удалении файла" });
  }
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
