import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, signToken } from "../trpc";
import { db } from "../db";
import { users, userConsents } from "../db/schema";

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email("Некорректный email"),
        password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
        name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
        consentPrivacyPolicy: z.literal(true, {
          errorMap: () => ({ message: "Необходимо принять Политику конфиденциальности" }),
        }),
        consentPersonalData: z.literal(true, {
          errorMap: () => ({ message: "Необходимо дать согласие на обработку персональных данных" }),
        }),
        consentCookiePolicy: z.literal(true, {
          errorMap: () => ({ message: "Необходимо принять Политику использования Cookie" }),
        }),
        consentMarketing: z.literal(true, {
          errorMap: () => ({ message: "Необходимо дать согласие на получение рассылок" }),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();

      const existing = await db.query.users.findFirst({
        where: sql`lower(${users.email}) = ${email}`,
      });

      if (existing) {
        throw new Error("Пользователь с таким email уже существует");
      }

      const passwordHash = await bcrypt.hash(input.password, 10);

      const [user] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          name: input.name,
          role: "user",
        })
        .returning();

      // Save all 4 consents
      const ipAddress =
        (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        ctx.req.socket.remoteAddress ||
        null;
      const userAgent = (ctx.req.headers["user-agent"] as string) || null;

      const consentTypes = [
        "privacy_policy" as const,
        "personal_data" as const,
        "cookie_policy" as const,
        "marketing" as const,
      ];

      for (const consentType of consentTypes) {
        await db.insert(userConsents).values({
          userId: user.id,
          consentType,
          action: "granted",
          policyVersion: 1,
          ipAddress,
          userAgent,
        });
      }

      const token = signToken(user.id, user.role);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tokenBalance: user.tokenBalance,
          createdAt: user.createdAt.toISOString(),
        },
        token,
      };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const email = input.email.toLowerCase().trim();
      console.log("[LOGIN] Handler reached, email:", email);
      try {
        let user;
        try {
          user = await db.query.users.findFirst({
            where: sql`lower(${users.email}) = ${email}`,
          });
        } catch (dbErr) {
          console.error("[LOGIN] DB query failed:", dbErr);
          throw dbErr;
        }

        if (!user) {
          console.log("[LOGIN] User not found for email:", email);
          throw new Error("Неверный email или пароль");
        }

        console.log("[LOGIN] passwordHash value:", user.passwordHash);
        console.log("[LOGIN] all user keys:", Object.keys(user));
        console.log("[LOGIN] User found, id:", user.id, "— comparing password");
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          console.log("[LOGIN] Password mismatch for user id:", user.id);
          throw new Error("Неверный email или пароль");
        }

        const token = signToken(user.id, user.role);
        console.log("[LOGIN] Success for user id:", user.id);

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tokenBalance: user.tokenBalance,
            createdAt: user.createdAt.toISOString(),
          },
          token,
        };
      } catch (e) {
        if ((e as Error).message !== "Неверный email или пароль") {
          console.error("[LOGIN] Unexpected error:", e);
        }
        throw e;
      }
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });

    if (!user) {
      throw new Error("Пользователь не найден");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenBalance: user.tokenBalance,
      createdAt: user.createdAt.toISOString(),
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await db
        .update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, ctx.userId))
        .returning();

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tokenBalance: user.tokenBalance,
        createdAt: user.createdAt.toISOString(),
      };
    }),
});
