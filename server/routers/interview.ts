import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { interviews, companies } from "../db/schema";
import { getQuestionsByMode } from "../../shared/questions";

export const interviewRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        mode: z.enum(["full", "express"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify company ownership
      const company = await db.query.companies.findFirst({
        where: and(eq(companies.id, input.companyId), eq(companies.userId, ctx.userId)),
      });
      if (!company) throw new Error("Компания не найдена");

      const [interview] = await db
        .insert(interviews)
        .values({
          companyId: input.companyId,
          mode: input.mode,
          answers: {},
        })
        .returning();

      return {
        ...interview,
        answers: interview.answers as Record<string, string>,
        createdAt: interview.createdAt.toISOString(),
        updatedAt: interview.updatedAt.toISOString(),
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, input.id),
        with: { company: true },
      });
      if (!interview) throw new Error("Интервью не найдено");
      if (interview.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      return {
        id: interview.id,
        companyId: interview.companyId,
        mode: interview.mode,
        status: interview.status,
        answers: interview.answers as Record<string, string>,
        completionPercent: interview.completionPercent,
        createdAt: interview.createdAt.toISOString(),
        updatedAt: interview.updatedAt.toISOString(),
      };
    }),

  saveAnswers: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        answers: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, input.id),
        with: { company: true },
      });
      if (!interview) throw new Error("Интервью не найдено");
      if (interview.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const currentAnswers = (interview.answers as Record<string, string>) || {};
      const mergedAnswers = { ...currentAnswers, ...input.answers };

      // Calculate completion percentage
      const questions = getQuestionsByMode(interview.mode as "full" | "express");
      const answeredCount = questions.filter(
        (q) => mergedAnswers[q.id] && mergedAnswers[q.id].trim().length > 0
      ).length;
      const completionPercent = Math.round((answeredCount / questions.length) * 100);

      const [updated] = await db
        .update(interviews)
        .set({
          answers: mergedAnswers,
          completionPercent,
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, input.id))
        .returning();

      return {
        ...updated,
        answers: updated.answers as Record<string, string>,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, input.id),
        with: { company: true },
      });
      if (!interview) throw new Error("Интервью не найдено");
      if (interview.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const [updated] = await db
        .update(interviews)
        .set({
          status: "completed",
          completionPercent: 100,
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, input.id))
        .returning();

      return {
        ...updated,
        answers: updated.answers as Record<string, string>,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  listByCompany: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const company = await db.query.companies.findFirst({
        where: and(eq(companies.id, input.companyId), eq(companies.userId, ctx.userId)),
      });
      if (!company) throw new Error("Компания не найдена");

      const result = await db.query.interviews.findMany({
        where: eq(interviews.companyId, input.companyId),
        orderBy: desc(interviews.updatedAt),
      });

      return result.map((i) => ({
        ...i,
        answers: i.answers as Record<string, string>,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      }));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, input.id),
        with: { company: true },
      });
      if (!interview) throw new Error("Интервью не найдено");
      if (interview.company.userId !== ctx.userId) throw new Error("Доступ запрещён");

      await db.delete(interviews).where(eq(interviews.id, input.id));
      return { success: true };
    }),
});
