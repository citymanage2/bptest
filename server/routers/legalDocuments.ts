import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { companies, companyRequisites, legalDocuments, legalAttachments, users, tokenOperations } from "../db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import path from "path";
import { generateLegalDocument, type LegalAttachedFile } from "../services/ai";
import type { CompanyRequisites, LegalDocType } from "../../shared/types";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// ── Zod schemas ──────────────────────────────────────────────────────────────

const RequisitesZ = z.object({
  fullName: z.string().nullable(),
  shortName: z.string().nullable(),
  legalAddress: z.string().nullable(),
  inn: z.string().nullable(),
  kpp: z.string().nullable(),
  ogrn: z.string().nullable(),
  bankAccount: z.string().nullable(),
  bik: z.string().nullable(),
  corrAccount: z.string().nullable(),
  bankName: z.string().nullable(),
  signatoryTitle: z.string().nullable(),
  signatoryName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  letterheadUrl: z.string().nullable(),
});

const LEGAL_DOC_TOKEN_COST = 100;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertCompanyOwner(companyId: number, userId: number) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Компания не найдена" });
  if (company.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Нет доступа" });
  return company;
}

async function deductTokens(userId: number, amount: number, description: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.tokenBalance < amount) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Недостаточно токенов. Необходимо: ${amount}, доступно: ${user?.tokenBalance ?? 0}`,
    });
  }
  await db.update(users).set({ tokenBalance: user.tokenBalance - amount }).where(eq(users.id, userId));
  await db.insert(tokenOperations).values({
    userId,
    amount: -amount,
    type: "legal_document" as any,
    description,
  });
}

// ── Router ───────────────────────────────────────────────────────────────────

export const legalDocumentsRouter = router({
  // Get company requisites
  getRequisites: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyOwner(input.companyId, ctx.userId);
      const rec = await db.query.companyRequisites.findFirst({
        where: eq(companyRequisites.companyId, input.companyId),
      });
      if (!rec) return null;
      return {
        ...(rec.data as CompanyRequisites),
        letterheadUrl: rec.letterheadUrl,
      };
    }),

  // Save company requisites
  saveRequisites: protectedProcedure
    .input(z.object({ companyId: z.number(), data: RequisitesZ }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyOwner(input.companyId, ctx.userId);
      const { letterheadUrl, ...rest } = input.data;
      await db
        .insert(companyRequisites)
        .values({
          companyId: input.companyId,
          data: rest,
          letterheadUrl: letterheadUrl ?? undefined,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: companyRequisites.companyId,
          set: {
            data: rest,
            ...(letterheadUrl !== undefined ? { letterheadUrl } : {}),
            updatedAt: new Date(),
          },
        });
      return { success: true };
    }),

  // List documents for a company
  listDocuments: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyOwner(input.companyId, ctx.userId);
      const docs = await db.query.legalDocuments.findMany({
        where: eq(legalDocuments.companyId, input.companyId),
        orderBy: [desc(legalDocuments.createdAt)],
      });
      return docs.map((d) => ({
        id: d.id,
        companyId: d.companyId,
        userId: d.userId,
        type: d.type as LegalDocType,
        title: d.title,
        content: d.content,
        createdAt: d.createdAt.toISOString(),
      }));
    }),

  // Generate legal document via AI
  generate: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        type: z.enum([
          "letter",
          "claim_response",
          "claim",
          "dispute_protocol",
          "contract_analysis",
          "contract_edit",
          "complaint",
        ]),
        prompt: z.string().min(10).max(20000),
        attachmentIds: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertCompanyOwner(input.companyId, ctx.userId);

      // Get requisites
      const rec = await db.query.companyRequisites.findFirst({
        where: eq(companyRequisites.companyId, input.companyId),
      });
      const requisites = (rec?.data ?? {}) as Record<string, string | null>;

      // Resolve attached files
      let attachedFiles: LegalAttachedFile[] = [];
      if (input.attachmentIds && input.attachmentIds.length > 0) {
        const records = await db.query.legalAttachments.findMany({
          where: inArray(legalAttachments.id, input.attachmentIds),
        });
        // Verify ownership and belonging to same company
        attachedFiles = records
          .filter((r) => r.userId === ctx.userId && r.companyId === input.companyId)
          .map((r) => ({
            storedPath: path.join(UPLOADS_DIR, r.storedName),
            originalName: r.originalName,
            mimeType: r.mimeType,
          }));
      }

      // Deduct tokens
      await deductTokens(
        ctx.userId,
        LEGAL_DOC_TOKEN_COST,
        `Юридический документ: ${input.type}`
      );

      // Generate via AI
      const { title, content } = await generateLegalDocument(requisites, input.prompt, attachedFiles);

      // Save document
      const [doc] = await db
        .insert(legalDocuments)
        .values({
          companyId: input.companyId,
          userId: ctx.userId,
          type: input.type,
          title,
          content,
        })
        .returning();

      return {
        id: doc.id,
        companyId: doc.companyId,
        userId: doc.userId,
        type: doc.type as LegalDocType,
        title: doc.title,
        content: doc.content,
        createdAt: doc.createdAt.toISOString(),
      };
    }),

  // Delete a document
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const doc = await db.query.legalDocuments.findFirst({
        where: eq(legalDocuments.id, input.id),
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Документ не найден" });
      await assertCompanyOwner(doc.companyId, ctx.userId);
      await db.delete(legalDocuments).where(eq(legalDocuments.id, input.id));
      return { success: true };
    }),
});
