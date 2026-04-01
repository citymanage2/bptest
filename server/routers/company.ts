import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { companies, processes, interviews, documents } from "../db/schema";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || "dummy-key",
});

export const companyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const result = await db.query.companies.findMany({
      where: eq(companies.userId, ctx.userId),
      orderBy: desc(companies.updatedAt),
    });
    return result.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const company = await db.query.companies.findFirst({
        where: and(eq(companies.id, input.id), eq(companies.userId, ctx.userId)),
      });
      if (!company) throw new Error("Компания не найдена");
      return {
        ...company,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Введите название компании"),
        industry: z.string().min(1, "Введите сферу деятельности"),
        inn: z.string().optional(),
        description: z.string().optional(),
        contactInfo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [company] = await db
        .insert(companies)
        .values({
          userId: ctx.userId,
          name: input.name,
          industry: input.industry,
          inn: input.inn || null,
          description: input.description || null,
          contactInfo: input.contactInfo || null,
        })
        .returning();
      return {
        ...company,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      };
    }),

  generateDescription: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        industry: z.string().min(1),
        inn: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const prompt = `Ты — эксперт по бизнес-процессам. Напиши краткое описание компании для системы построения бизнес-процессов.

Компания: ${input.name}
Отрасль: ${input.industry}${input.inn ? `\nИНН: ${input.inn}` : ""}

Требования к описанию:
- Максимум 500 символов
- Только проверенная и достоверная информация об отрасли
- Акцент на ключевых бизнес-процессах компании данной отрасли
- Укажи типичные процессы: продажи, производство, логистика, сервис — в зависимости от отрасли
- Без воды, конкретно и по делу
- На русском языке

Верни только текст описания, без заголовков и пояснений.`;

      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
      return { description: text.slice(0, 500) };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        industry: z.string().min(1).optional(),
        inn: z.string().optional(),
        description: z.string().optional(),
        contactInfo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [company] = await db
        .update(companies)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(companies.id, id), eq(companies.userId, ctx.userId)))
        .returning();
      if (!company) throw new Error("Компания не найдена");
      return {
        ...company,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(companies)
        .where(and(eq(companies.id, input.id), eq(companies.userId, ctx.userId)));
      return { success: true };
    }),

  getProcesses: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const company = await db.query.companies.findFirst({
        where: and(eq(companies.id, input.companyId), eq(companies.userId, ctx.userId)),
      });
      if (!company) throw new Error("Компания не найдена");

      const result = await db.query.processes.findMany({
        where: eq(processes.companyId, input.companyId),
        orderBy: desc(processes.updatedAt),
      });
      return result.map((p) => ({
        id: p.id,
        interviewId: p.interviewId,
        companyId: p.companyId,
        status: p.status,
        data: p.data as any,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));
    }),

  getDocuments: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const company = await db.query.companies.findFirst({
        where: and(eq(companies.id, input.companyId), eq(companies.userId, ctx.userId)),
      });
      if (!company) throw new Error("Компания не найдена");

      const result = await db.query.documents.findMany({
        where: eq(documents.companyId, input.companyId),
        orderBy: desc(documents.createdAt),
      });
      return result.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }));
    }),
});
