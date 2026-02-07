import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import superjson from "superjson";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface Context {
  req: Request;
  res: Response;
  userId: number | null;
  userRole: "user" | "admin" | null;
}

export function createContext(req: Request, res: Response): Context {
  let userId: number | null = null;
  let userRole: "user" | "admin" | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, JWT_SECRET) as {
        userId: number;
        role: "user" | "admin";
      };
      userId = payload.userId;
      userRole = payload.role;
    } catch {
      // Invalid token, continue as unauthenticated
    }
  }

  return { req, res, userId, userRole };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Необходима авторизация",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      userRole: ctx.userRole!,
    },
  });
});

export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId || ctx.userRole !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Требуются права администратора",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      userRole: ctx.userRole as "admin",
    },
  });
});

export function signToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    return payload.userId;
  } catch {
    return null;
  }
}
