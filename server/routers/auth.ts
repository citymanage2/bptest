import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, signToken } from "../trpc";
import { db } from "../db";
import { users } from "../db/schema";

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email("Некорректный email"),
        password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
        name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (existing) {
        throw new Error("Пользователь с таким email уже существует");
      }

      const passwordHash = await bcrypt.hash(input.password, 10);

      const [user] = await db
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          name: input.name,
        })
        .returning();

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
      const user = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (!user) {
        throw new Error("Неверный email или пароль");
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new Error("Неверный email или пароль");
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
