import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { db } from "../db";
import { users, payments } from "../db/schema";
import { TOKEN_PACKAGES } from "../payments/packages";
import { initPayment, buildReceipt } from "../payments/tbank";
import crypto from "crypto";

export const paymentRouter = router({
  createOrder: protectedProcedure
    .input(z.object({ packageId: z.enum(["start", "basic", "pro"]) }))
    .mutation(async ({ ctx, input }) => {
      const pkg = TOKEN_PACKAGES.find((p) => p.id === input.packageId);
      if (!pkg) throw new TRPCError({ code: "BAD_REQUEST", message: "Неверный пакет" });

      const user = await db.query.users.findFirst({ where: eq(users.id, ctx.userId) });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const confirmedPayments = await db.query.payments.findMany({
        where: and(eq(payments.userId, ctx.userId), eq(payments.status, "confirmed")),
        columns: { id: true },
      });
      const isFirstPayment = confirmedPayments.length === 0;

      const orderId = crypto.randomUUID();

      await db.insert(payments).values({
        userId: ctx.userId,
        orderId,
        packageId: pkg.id,
        amount: pkg.amount,
        tokens: pkg.tokens,
        isFirstPayment,
        status: "pending",
      });

      const receipt = buildReceipt(pkg, user.email);

      let paymentUrl: string;
      let paymentId: string;
      try {
        ({ paymentUrl, paymentId } = await initPayment({
          orderId,
          amount: pkg.amount,
          description: `Пополнение токенового баланса (${pkg.tokens} токенов)`,
          receipt,
          successUrl: "https://biz-process.ru/payment/success",
          failUrl: "https://biz-process.ru/pricing",
        }));
      } catch (err) {
        await db.update(payments)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(payments.orderId, orderId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Ошибка создания платежа",
        });
      }

      await db.update(payments)
        .set({ paymentId, updatedAt: new Date() })
        .where(eq(payments.orderId, orderId));

      return { paymentUrl };
    }),

  getStatus: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      const payment = await db.query.payments.findFirst({
        where: and(
          eq(payments.orderId, input.orderId),
          eq(payments.userId, ctx.userId)
        ),
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND" });

      const pkg = TOKEN_PACKAGES.find((p) => p.id === payment.packageId);
      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
        columns: { tokenBalance: true },
      });

      return {
        status: payment.status,
        packageId: payment.packageId,
        packageName: pkg?.name ?? payment.packageId,
        amount: payment.amount,
        tokens: payment.tokens,
        tokensCredited: payment.tokensCredited,
        isFirstPayment: payment.isFirstPayment,
        tokenBalance: user?.tokenBalance ?? 0,
        createdAt: payment.createdAt,
      };
    }),

  getUserHistory: protectedProcedure.query(async ({ ctx }) => {
    const history = await db.query.payments.findMany({
      where: eq(payments.userId, ctx.userId),
      orderBy: desc(payments.createdAt),
    });
    return history.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      packageId: p.packageId,
      packageName: TOKEN_PACKAGES.find((pkg) => pkg.id === p.packageId)?.name ?? p.packageId,
      amount: p.amount,
      tokens: p.tokens,
      tokensCredited: p.tokensCredited,
      isFirstPayment: p.isFirstPayment,
      status: p.status,
      createdAt: p.createdAt,
    }));
  }),

  adminGetAll: adminProcedure.query(async () => {
    const allPayments = await db.query.payments.findMany({
      orderBy: desc(payments.createdAt),
      with: { user: { columns: { id: true, email: true, name: true } } },
    });
    return allPayments.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      userId: p.userId,
      userEmail: p.user.email,
      userName: p.user.name,
      packageId: p.packageId,
      packageName: TOKEN_PACKAGES.find((pkg) => pkg.id === p.packageId)?.name ?? p.packageId,
      amount: p.amount,
      tokens: p.tokens,
      tokensCredited: p.tokensCredited,
      isFirstPayment: p.isFirstPayment,
      status: p.status,
      createdAt: p.createdAt,
    }));
  }),
});
