import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { businessModels, companies, processes } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { calculateBusinessModel } from "../services/businessModel";
import type { BusinessModelInput } from "../../shared/types";

// ── Zod schemas ────────────────────────────────────────────────────────────

const CostLineZ = z.object({
  name: z.string().min(1),
  percent: z.number().min(0).max(100),
});

const CanvasInputZ = z.object({
  company_name: z.string().nullable(),
  industry: z.string().nullable(),
  geography: z.array(z.string()).nullable(),
  b2b_b2c: z.enum(["B2B", "B2C", "B2G"]).nullable(),
  customer_segments: z.array(z.string()).nullable(),
  value_propositions: z.array(z.string()).nullable(),
  channels: z.array(z.string()).nullable(),
  customer_relationships: z.array(z.string()).nullable(),
  revenue_streams: z.array(z.string()).nullable(),
  key_resources: z.array(z.string()).nullable(),
  key_activities: z.array(z.string()).nullable(),
  key_partners: z.array(z.string()).nullable(),
  cost_structure: z.array(z.string()).nullable(),
  notes: z.string().nullable(),
});

const MonthArrayZ = z.array(z.number().nullable()).length(12).nullable();

const BusinessModelInputZ = z.object({
  year: z.number().int().min(2000).max(2100),
  mode: z.enum(["DIVIDENDS_TO_REVENUE", "REVENUE_DIRECT", "PROFIT_TO_REVENUE"]),
  rounding: z.object({
    money_unit: z.enum(["RUB", "THOUSAND", "MILLION"]),
    deals: z.enum(["CEIL", "ROUND", "FLOOR"]),
    avg_ticket_unit: z.enum(["RUB", "THOUSAND", "MILLION"]),
  }),
  tolerance: z.object({
    avg_ticket_vs_deals_pct: z.number().min(0),
  }),
  target_profit_pct: z.number().nullable(),
  cost_lines: z.array(CostLineZ).min(1),
  dividends_needed_by_month: MonthArrayZ,
  revenue_plan_by_month: MonthArrayZ,
  profit_needed_by_month: MonthArrayZ,
  deals_count_by_month: MonthArrayZ,
  avg_ticket_by_month: MonthArrayZ,
  canvas: CanvasInputZ,
});

// ── Helper ─────────────────────────────────────────────────────────────────

async function assertCompanyOwner(companyId: number, userId: number) {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.userId, userId)),
  });
  if (!company)
    throw new TRPCError({ code: "FORBIDDEN", message: "Компания не найдена" });
  return company;
}

async function assertHasProcesses(companyId: number) {
  const procs = await db.query.processes.findMany({
    where: eq(processes.companyId, companyId),
  });
  if (procs.length === 0)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Для создания бизнес-модели необходим хотя бы один процесс компании",
    });
}

// ── Router ─────────────────────────────────────────────────────────────────

export const businessModelRouter = router({
  /** List business models for a company */
  listByCompany: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertCompanyOwner(input.companyId, ctx.userId);
      return db.query.businessModels.findMany({
        where: eq(businessModels.companyId, input.companyId),
        orderBy: [desc(businessModels.updatedAt)],
      });
    }),

  /** Get one business model */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const bm = await db.query.businessModels.findFirst({
        where: eq(businessModels.id, input.id),
      });
      if (!bm) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwner(bm.companyId, ctx.userId);
      return bm;
    }),

  /** Create a new business model (requires at least one process) */
  create: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        name: z.string().min(1).max(500),
        input: BusinessModelInputZ,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCompanyOwner(input.companyId, ctx.userId);
      await assertHasProcesses(input.companyId);

      const modelInput = input.input as BusinessModelInput;
      const output = calculateBusinessModel(modelInput);

      const [created] = await db
        .insert(businessModels)
        .values({
          companyId: input.companyId,
          userId: ctx.userId,
          name: input.name,
          input: modelInput as any,
          output: output as any,
        })
        .returning();

      return created;
    }),

  /** Recalculate and update an existing business model */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(500).optional(),
        input: BusinessModelInputZ,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bm = await db.query.businessModels.findFirst({
        where: eq(businessModels.id, input.id),
      });
      if (!bm) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwner(bm.companyId, ctx.userId);

      const modelInput = input.input as BusinessModelInput;
      const output = calculateBusinessModel(modelInput);

      const [updated] = await db
        .update(businessModels)
        .set({
          name: input.name ?? bm.name,
          input: modelInput as any,
          output: output as any,
          updatedAt: new Date(),
        })
        .where(eq(businessModels.id, input.id))
        .returning();

      return updated;
    }),

  /** Delete */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const bm = await db.query.businessModels.findFirst({
        where: eq(businessModels.id, input.id),
      });
      if (!bm) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCompanyOwner(bm.companyId, ctx.userId);
      await db.delete(businessModels).where(eq(businessModels.id, input.id));
      return { success: true };
    }),

  /** Preview calculation without saving */
  preview: protectedProcedure
    .input(BusinessModelInputZ)
    .mutation(async ({ input }) => {
      const modelInput = input as BusinessModelInput;
      return calculateBusinessModel(modelInput);
    }),
});
