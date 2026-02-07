import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { companies, processes, interviews, documents } from "../db/schema";

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

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        industry: z.string().min(1).optional(),
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
