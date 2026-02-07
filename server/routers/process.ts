import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import {
  processes,
  processVersions,
  changeRequests,
  recommendations,
  interviews,
  companies,
  users,
  tokenOperations,
} from "../db/schema";
import { generateProcess, applyChanges, generateRecommendations, generatePassport } from "../services/ai";
import type { AttachedFileMeta } from "../services/ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename_p = fileURLToPath(import.meta.url);
const __dirname_p = path.dirname(__filename_p);
const uploadsDir = path.resolve(__dirname_p, "../../uploads");
import { validateProcess } from "../services/validation";
import type { ProcessData } from "../../shared/types";
import { TOKEN_COSTS } from "../../shared/types";

async function deductTokens(userId: number, amount: number, type: string, description: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.tokenBalance < amount) {
    throw new Error(`Недостаточно токенов. Необходимо: ${amount}, доступно: ${user?.tokenBalance ?? 0}`);
  }
  await db.update(users).set({ tokenBalance: user.tokenBalance - amount }).where(eq(users.id, userId));
  await db.insert(tokenOperations).values({
    userId,
    amount: -amount,
    type: type as any,
    description,
  });
}

export const processRouter = router({
  generate: protectedProcedure
    .input(z.object({ interviewId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, input.interviewId),
        with: { company: true },
      });
      if (!interview) throw new Error("Интервью не найдено");
      if (interview.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      // Deduct tokens
      await deductTokens(ctx.userId, TOKEN_COSTS.generation, "generation", "Генерация бизнес-процесса");

      // Generate process via AI
      const answers = interview.answers as Record<string, string>;

      // Read attached files content for AI
      const rawFiles = (interview.answers as Record<string, unknown>).__files__;
      let attachedFiles: AttachedFileMeta[] | undefined;
      if (Array.isArray(rawFiles) && rawFiles.length > 0) {
        const textExtensions = [".txt", ".csv", ".md", ".rtf", ".log"];
        attachedFiles = (rawFiles as Array<Record<string, unknown>>).map((f) => {
          const meta: AttachedFileMeta = {
            name: f.name as string,
            size: f.size as number,
            type: f.type as string,
            storedName: f.storedName as string,
          };
          // Try to read text content for text-based files
          const ext = path.extname(meta.name).toLowerCase();
          if (textExtensions.includes(ext) || meta.type.startsWith("text/")) {
            try {
              const filePath = path.join(uploadsDir, meta.storedName);
              if (fs.existsSync(filePath)) {
                meta.content = fs.readFileSync(filePath, "utf-8");
              }
            } catch { /* skip unreadable files */ }
          }
          return meta;
        });
      }

      const processData = await generateProcess(answers, interview.company.name, interview.company.industry, attachedFiles);

      // Save process
      const [process] = await db
        .insert(processes)
        .values({
          interviewId: interview.id,
          companyId: interview.companyId,
          status: "active",
          data: processData,
        })
        .returning();

      // Create initial version
      await db.insert(processVersions).values({
        processId: process.id,
        data: processData,
        description: "Первоначальная генерация",
      });

      // Mark interview as completed
      await db
        .update(interviews)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(interviews.id, interview.id));

      return {
        id: process.id,
        interviewId: process.interviewId,
        companyId: process.companyId,
        status: process.status,
        data: process.data as ProcessData,
        createdAt: process.createdAt.toISOString(),
        updatedAt: process.updatedAt.toISOString(),
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.id),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId && ctx.userRole !== "admin") {
        throw new Error("Доступ запрещён");
      }

      return {
        id: process.id,
        interviewId: process.interviewId,
        companyId: process.companyId,
        status: process.status,
        data: process.data as ProcessData,
        createdAt: process.createdAt.toISOString(),
        updatedAt: process.updatedAt.toISOString(),
      };
    }),

  updateData: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.any(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.id),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const [updated] = await db
        .update(processes)
        .set({ data: input.data, updatedAt: new Date() })
        .where(eq(processes.id, input.id))
        .returning();

      return {
        id: updated.id,
        interviewId: updated.interviewId,
        companyId: updated.companyId,
        status: updated.status,
        data: updated.data as ProcessData,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  regenerate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.id),
        with: { company: true, interview: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      // Deduct tokens
      await deductTokens(ctx.userId, TOKEN_COSTS.regeneration, "regeneration", "Регенерация бизнес-процесса");

      // Save current version
      await db.insert(processVersions).values({
        processId: process.id,
        data: process.data,
        description: "Версия перед регенерацией",
      });

      // Regenerate
      const answers = (process.interview as any).answers as Record<string, string>;
      const newData = await generateProcess(answers, process.company.name, process.company.industry);

      const [updated] = await db
        .update(processes)
        .set({ data: newData, updatedAt: new Date() })
        .where(eq(processes.id, input.id))
        .returning();

      return {
        id: updated.id,
        interviewId: updated.interviewId,
        companyId: updated.companyId,
        status: updated.status,
        data: updated.data as ProcessData,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  requestChange: protectedProcedure
    .input(
      z.object({
        processId: z.number(),
        description: z.string().min(10, "Опишите изменения подробнее"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.processId),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      // Deduct tokens
      await deductTokens(ctx.userId, TOKEN_COSTS.change_request, "change_request", "Запрос изменений");

      const currentData = process.data as ProcessData;
      const newData = await applyChanges(currentData, input.description);

      const [changeRequest] = await db
        .insert(changeRequests)
        .values({
          processId: process.id,
          description: input.description,
          previousData: currentData,
          newData: newData,
        })
        .returning();

      return {
        id: changeRequest.id,
        processId: changeRequest.processId,
        description: changeRequest.description,
        status: changeRequest.status,
        previousData: changeRequest.previousData as ProcessData,
        newData: changeRequest.newData as ProcessData,
        createdAt: changeRequest.createdAt.toISOString(),
      };
    }),

  applyChange: protectedProcedure
    .input(z.object({ changeRequestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cr = await db.query.changeRequests.findFirst({
        where: eq(changeRequests.id, input.changeRequestId),
        with: { process: { with: { company: true } } },
      });
      if (!cr) throw new Error("Запрос изменений не найден");
      if ((cr.process as any).company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      // Save current version
      await db.insert(processVersions).values({
        processId: cr.processId,
        data: cr.previousData,
        description: `Версия перед изменением: ${cr.description.slice(0, 100)}`,
      });

      // Apply changes
      await db
        .update(processes)
        .set({ data: cr.newData, updatedAt: new Date() })
        .where(eq(processes.id, cr.processId));

      // Update change request status
      await db
        .update(changeRequests)
        .set({ status: "applied" })
        .where(eq(changeRequests.id, input.changeRequestId));

      return { success: true };
    }),

  rejectChange: protectedProcedure
    .input(z.object({ changeRequestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const cr = await db.query.changeRequests.findFirst({
        where: eq(changeRequests.id, input.changeRequestId),
        with: { process: { with: { company: true } } },
      });
      if (!cr) throw new Error("Запрос изменений не найден");
      if ((cr.process as any).company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      await db
        .update(changeRequests)
        .set({ status: "rejected" })
        .where(eq(changeRequests.id, input.changeRequestId));

      return { success: true };
    }),

  getVersions: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.processId),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const versions = await db.query.processVersions.findMany({
        where: eq(processVersions.processId, input.processId),
        orderBy: desc(processVersions.createdAt),
      });

      return versions.map((v) => ({
        id: v.id,
        processId: v.processId,
        data: v.data as ProcessData,
        description: v.description,
        createdAt: v.createdAt.toISOString(),
      }));
    }),

  rollback: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const version = await db.query.processVersions.findFirst({
        where: eq(processVersions.id, input.versionId),
        with: { process: { with: { company: true } } },
      });
      if (!version) throw new Error("Версия не найдена");
      if ((version.process as any).company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      // Save current as a new version
      await db.insert(processVersions).values({
        processId: version.processId,
        data: (version.process as any).data,
        description: "Версия перед откатом",
      });

      // Rollback
      await db
        .update(processes)
        .set({ data: version.data, updatedAt: new Date() })
        .where(eq(processes.id, version.processId));

      return { success: true };
    }),

  getChangeRequests: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.processId),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const result = await db.query.changeRequests.findMany({
        where: eq(changeRequests.processId, input.processId),
        orderBy: desc(changeRequests.createdAt),
      });

      return result.map((cr) => ({
        id: cr.id,
        processId: cr.processId,
        description: cr.description,
        status: cr.status,
        previousData: cr.previousData as ProcessData,
        newData: cr.newData as ProcessData,
        createdAt: cr.createdAt.toISOString(),
      }));
    }),

  getRecommendations: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.processId),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const result = await db.query.recommendations.findMany({
        where: eq(recommendations.processId, input.processId),
        orderBy: desc(recommendations.createdAt),
      });

      return result.map((r) => ({
        id: r.id,
        processId: r.processId,
        category: r.category,
        title: r.title,
        description: r.description,
        priority: r.priority,
        relatedSteps: r.relatedSteps as string[],
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  generateRecommendations: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.processId),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      await deductTokens(ctx.userId, TOKEN_COSTS.recommendations, "recommendations", "Генерация рекомендаций");

      const processData = process.data as ProcessData;
      const recs = await generateRecommendations(processData);

      // Save recommendations
      const saved = [];
      for (const rec of recs) {
        const [r] = await db
          .insert(recommendations)
          .values({
            processId: process.id,
            category: rec.category as any,
            title: rec.title,
            description: rec.description,
            priority: rec.priority as any,
            relatedSteps: rec.relatedSteps,
          })
          .returning();
        saved.push(r);
      }

      return saved.map((r) => ({
        id: r.id,
        processId: r.processId,
        category: r.category,
        title: r.title,
        description: r.description,
        priority: r.priority,
        relatedSteps: r.relatedSteps as string[],
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  getPassport: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.processId),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const processData = process.data as ProcessData;
      return generatePassport(processData);
    }),

  validateQuality: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.processId),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const processData = process.data as ProcessData;
      return validateProcess(processData);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.id),
        with: { company: true },
      });
      if (!process) throw new Error("Процесс не найден");
      if (process.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      await db.delete(processes).where(eq(processes.id, input.id));
      return { success: true };
    }),
});
