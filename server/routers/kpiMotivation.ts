import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { kpiPlans, processes, companies } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { RoleKpiPlan } from "../../shared/types";

// ── Zod schemas ─────────────────────────────────────────────────────────────

const KpiDefinitionZ = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  type: z.enum(["revenue", "deals", "conversion", "avg_ticket", "time", "quality", "custom"]),
  unit: z.string(),
  targetValue: z.number().nullable(),
  weight: z.number().min(0).max(100),
  sourceLink: z.enum(["bm_revenue", "bm_deals", "bm_avg_ticket", "bm_profit", "manual"]),
  linkedBlockId: z.string().nullable(),
});

const MotivationPartZ = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.enum(["fixed", "variable_kpi", "bonus_threshold"]),
  amount: z.number().nullable(),
  pctOfBase: z.number().nullable(),
  thresholdPct: z.number().nullable(),
  bonusAmount: z.number().nullable(),
  kpiIds: z.array(z.string()),
});

const RoleKpiPlanZ = z.object({
  roleId: z.string(),
  roleName: z.string(),
  kpis: z.array(KpiDefinitionZ),
  motivationParts: z.array(MotivationPartZ),
});

const KpiPlanInputZ = z.object({
  name: z.string().min(1).max(500),
  year: z.number().int().min(2000).max(2100),
  linkedBusinessModelId: z.number().nullable(),
  roles: z.array(RoleKpiPlanZ),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertProcessOwner(processId: number, userId: number) {
  const process = await db.query.processes.findFirst({
    where: eq(processes.id, processId),
    with: { company: true },
  });
  if (!process) throw new TRPCError({ code: "NOT_FOUND", message: "Процесс не найден" });
  if ((process as any).company.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа" });
  }
  return process;
}

async function assertPlanOwner(planId: number, userId: number) {
  const plan = await db.query.kpiPlans.findFirst({
    where: eq(kpiPlans.id, planId),
  });
  if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "План не найден" });
  if (plan.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа" });
  return plan;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const kpiMotivationRouter = router({
  listByProcess: protectedProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertProcessOwner(input.processId, ctx.userId);
      const plans = await db.query.kpiPlans.findMany({
        where: eq(kpiPlans.processId, input.processId),
        orderBy: [desc(kpiPlans.updatedAt)],
      });
      return plans.map((p) => ({
        id: p.id,
        processId: p.processId,
        companyId: p.companyId,
        userId: p.userId,
        name: p.name,
        year: p.year,
        linkedBusinessModelId: p.linkedBusinessModelId,
        roles: p.roles as RoleKpiPlan[],
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const plan = await assertPlanOwner(input.id, ctx.userId);
      return {
        id: plan.id,
        processId: plan.processId,
        companyId: plan.companyId,
        userId: plan.userId,
        name: plan.name,
        year: plan.year,
        linkedBusinessModelId: plan.linkedBusinessModelId,
        roles: plan.roles as RoleKpiPlan[],
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      };
    }),

  create: protectedProcedure
    .input(z.object({ processId: z.number(), data: KpiPlanInputZ }))
    .mutation(async ({ input, ctx }) => {
      const process = await assertProcessOwner(input.processId, ctx.userId);
      const [created] = await db
        .insert(kpiPlans)
        .values({
          processId: input.processId,
          companyId: process.companyId,
          userId: ctx.userId,
          name: input.data.name,
          year: input.data.year,
          linkedBusinessModelId: input.data.linkedBusinessModelId,
          roles: input.data.roles,
        })
        .returning();
      return {
        id: created.id,
        processId: created.processId,
        companyId: created.companyId,
        userId: created.userId,
        name: created.name,
        year: created.year,
        linkedBusinessModelId: created.linkedBusinessModelId,
        roles: created.roles as RoleKpiPlan[],
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: KpiPlanInputZ }))
    .mutation(async ({ input, ctx }) => {
      await assertPlanOwner(input.id, ctx.userId);
      const [updated] = await db
        .update(kpiPlans)
        .set({
          name: input.data.name,
          year: input.data.year,
          linkedBusinessModelId: input.data.linkedBusinessModelId,
          roles: input.data.roles,
          updatedAt: new Date(),
        })
        .where(eq(kpiPlans.id, input.id))
        .returning();
      return {
        id: updated.id,
        processId: updated.processId,
        companyId: updated.companyId,
        userId: updated.userId,
        name: updated.name,
        year: updated.year,
        linkedBusinessModelId: updated.linkedBusinessModelId,
        roles: updated.roles as RoleKpiPlan[],
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertPlanOwner(input.id, ctx.userId);
      await db.delete(kpiPlans).where(eq(kpiPlans.id, input.id));
      return { success: true };
    }),
});
