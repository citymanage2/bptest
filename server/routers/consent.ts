import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { db } from "../db";
import { userConsents, cookieConsents, policyVersions } from "../db/schema";

export const consentRouter = router({
  // Save cookie consent settings (anonymous or authenticated)
  saveCookieConsent: publicProcedure
    .input(
      z.object({
        visitorId: z.string().min(1),
        functional: z.boolean(),
        analytics: z.boolean(),
        marketing: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ipAddress =
        (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        ctx.req.socket.remoteAddress ||
        null;
      const userAgent = (ctx.req.headers["user-agent"] as string) || null;

      const existing = await db.query.cookieConsents.findFirst({
        where: eq(cookieConsents.visitorId, input.visitorId),
      });

      if (existing) {
        await db
          .update(cookieConsents)
          .set({
            functional: input.functional,
            analytics: input.analytics,
            marketing: input.marketing,
            userId: ctx.userId,
            ipAddress,
            userAgent,
            updatedAt: new Date(),
          })
          .where(eq(cookieConsents.id, existing.id));
      } else {
        await db.insert(cookieConsents).values({
          visitorId: input.visitorId,
          userId: ctx.userId,
          functional: input.functional,
          analytics: input.analytics,
          marketing: input.marketing,
          ipAddress,
          userAgent,
        });
      }

      return { success: true };
    }),

  // Get current cookie settings
  getCookieConsent: publicProcedure
    .input(z.object({ visitorId: z.string().min(1) }))
    .query(async ({ input }) => {
      const consent = await db.query.cookieConsents.findFirst({
        where: eq(cookieConsents.visitorId, input.visitorId),
      });

      if (!consent) return null;

      return {
        functional: consent.functional,
        analytics: consent.analytics,
        marketing: consent.marketing,
        updatedAt: consent.updatedAt.toISOString(),
      };
    }),

  // Save registration consents (all 4 types)
  saveRegistrationConsents: protectedProcedure
    .input(
      z.object({
        privacyPolicy: z.literal(true),
        personalData: z.literal(true),
        cookiePolicy: z.literal(true),
        marketing: z.literal(true),
        policyVersion: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ipAddress =
        (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        ctx.req.socket.remoteAddress ||
        null;
      const userAgent = (ctx.req.headers["user-agent"] as string) || null;

      const consentTypes = [
        { type: "privacy_policy" as const, agreed: input.privacyPolicy },
        { type: "personal_data" as const, agreed: input.personalData },
        { type: "cookie_policy" as const, agreed: input.cookiePolicy },
        { type: "marketing" as const, agreed: input.marketing },
      ];

      for (const c of consentTypes) {
        await db.insert(userConsents).values({
          userId: ctx.userId,
          consentType: c.type,
          action: "granted",
          policyVersion: input.policyVersion || 1,
          ipAddress,
          userAgent,
        });
      }

      return { success: true };
    }),

  // Get user consent history
  getConsentHistory: protectedProcedure.query(async ({ ctx }) => {
    const consents = await db.query.userConsents.findMany({
      where: eq(userConsents.userId, ctx.userId),
      orderBy: desc(userConsents.createdAt),
    });

    return consents.map((c) => ({
      id: c.id,
      consentType: c.consentType,
      action: c.action,
      policyVersion: c.policyVersion,
      revokeReason: c.revokeReason,
      createdAt: c.createdAt.toISOString(),
    }));
  }),

  // Revoke consent
  revokeConsent: protectedProcedure
    .input(
      z.object({
        consentType: z.enum(["privacy_policy", "personal_data", "cookie_policy", "marketing"]),
        reason: z.string().min(1, "Укажите причину отзыва согласия"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ipAddress =
        (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        ctx.req.socket.remoteAddress ||
        null;
      const userAgent = (ctx.req.headers["user-agent"] as string) || null;

      await db.insert(userConsents).values({
        userId: ctx.userId,
        consentType: input.consentType,
        action: "revoked",
        revokeReason: input.reason,
        ipAddress,
        userAgent,
      });

      return { success: true };
    }),

  // Get active policy text
  getPolicy: publicProcedure
    .input(z.object({ type: z.enum(["privacy", "cookie"]) }))
    .query(async ({ input }) => {
      const policy = await db.query.policyVersions.findFirst({
        where: and(
          eq(policyVersions.policyType, input.type),
          eq(policyVersions.isActive, true)
        ),
        orderBy: desc(policyVersions.version),
      });

      return policy
        ? {
            version: policy.version,
            content: policy.content,
            updatedAt: policy.createdAt.toISOString(),
          }
        : null;
    }),

  // Check current consent status for user
  getMyConsents: protectedProcedure.query(async ({ ctx }) => {
    const consents = await db.query.userConsents.findMany({
      where: eq(userConsents.userId, ctx.userId),
      orderBy: desc(userConsents.createdAt),
    });

    const status: Record<string, { active: boolean; grantedAt: string | null }> = {
      privacy_policy: { active: false, grantedAt: null },
      personal_data: { active: false, grantedAt: null },
      cookie_policy: { active: false, grantedAt: null },
      marketing: { active: false, grantedAt: null },
    };

    for (const type of Object.keys(status)) {
      const latest = consents.find((c) => c.consentType === type);
      if (latest) {
        status[type] = {
          active: latest.action === "granted",
          grantedAt: latest.createdAt.toISOString(),
        };
      }
    }

    return status;
  }),

  // Admin: consent statistics
  getConsentStats: adminProcedure.query(async () => {
    const totalUsers = await db.execute(sql`SELECT COUNT(DISTINCT user_id) as count FROM user_consents WHERE action = 'granted'`);
    const revokedCount = await db.execute(sql`SELECT COUNT(*) as count FROM user_consents WHERE action = 'revoked'`);

    const byType = await db.execute(sql`
      SELECT consent_type, action, COUNT(*) as count
      FROM user_consents
      GROUP BY consent_type, action
      ORDER BY consent_type
    `);

    const cookieStats = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN functional THEN 1 ELSE 0 END) as functional_count,
        SUM(CASE WHEN analytics THEN 1 ELSE 0 END) as analytics_count,
        SUM(CASE WHEN marketing THEN 1 ELSE 0 END) as marketing_count
      FROM cookie_consents
    `);

    const recentConsents = await db.query.userConsents.findMany({
      orderBy: desc(userConsents.createdAt),
      limit: 20,
    });

    return {
      totalUsersWithConsent: Number(totalUsers[0]?.count || 0),
      totalRevocations: Number(revokedCount[0]?.count || 0),
      byType: byType as unknown as Array<{ consent_type: string; action: string; count: number }>,
      cookieStats: {
        total: Number(cookieStats[0]?.total || 0),
        functional: Number(cookieStats[0]?.functional_count || 0),
        analytics: Number(cookieStats[0]?.analytics_count || 0),
        marketing: Number(cookieStats[0]?.marketing_count || 0),
      },
      recentConsents: recentConsents.map((c) => ({
        id: c.id,
        userId: c.userId,
        consentType: c.consentType,
        action: c.action,
        revokeReason: c.revokeReason,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }),

  // Admin: export user consent history (for GDPR/152-FZ data subject requests)
  exportUserConsents: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const consents = await db.query.userConsents.findMany({
        where: eq(userConsents.userId, input.userId),
        orderBy: desc(userConsents.createdAt),
      });

      return consents.map((c) => ({
        id: c.id,
        consentType: c.consentType,
        action: c.action,
        policyVersion: c.policyVersion,
        ipAddress: c.ipAddress,
        userAgent: c.userAgent,
        revokeReason: c.revokeReason,
        createdAt: c.createdAt.toISOString(),
      }));
    }),
});
