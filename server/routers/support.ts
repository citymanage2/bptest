import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "../db";
import { supportChats, supportMessages, faqArticles } from "../db/schema";

export const supportRouter = router({
  // User support chats
  myChats: protectedProcedure.query(async ({ ctx }) => {
    const chats = await db.query.supportChats.findMany({
      where: eq(supportChats.userId, ctx.userId),
      orderBy: desc(supportChats.updatedAt),
    });
    return chats.map((c) => ({
      id: c.id,
      userId: c.userId,
      status: c.status,
      subject: c.subject,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }),

  createChat: protectedProcedure
    .input(z.object({ subject: z.string().min(1), message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [chat] = await db
        .insert(supportChats)
        .values({
          userId: ctx.userId,
          subject: input.subject,
        })
        .returning();

      await db.insert(supportMessages).values({
        chatId: chat.id,
        senderId: ctx.userId,
        senderRole: "user",
        content: input.message,
      });

      return {
        id: chat.id,
        userId: chat.userId,
        status: chat.status,
        subject: chat.subject,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      };
    }),

  getChatMessages: protectedProcedure
    .input(z.object({ chatId: z.number() }))
    .query(async ({ ctx, input }) => {
      const chat = await db.query.supportChats.findFirst({
        where: eq(supportChats.id, input.chatId),
      });
      if (!chat) throw new Error("Чат не найден");
      if (chat.userId !== ctx.userId && ctx.userRole !== "admin") {
        throw new Error("Доступ запрещён");
      }

      const messages = await db.query.supportMessages.findMany({
        where: eq(supportMessages.chatId, input.chatId),
        orderBy: supportMessages.createdAt,
      });

      return messages.map((m) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        senderRole: m.senderRole,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }));
    }),

  sendMessage: protectedProcedure
    .input(z.object({ chatId: z.number(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const chat = await db.query.supportChats.findFirst({
        where: eq(supportChats.id, input.chatId),
      });
      if (!chat) throw new Error("Чат не найден");
      if (chat.userId !== ctx.userId) throw new Error("Доступ запрещён");

      const [message] = await db
        .insert(supportMessages)
        .values({
          chatId: input.chatId,
          senderId: ctx.userId,
          senderRole: "user",
          content: input.content,
        })
        .returning();

      await db
        .update(supportChats)
        .set({ updatedAt: new Date() })
        .where(eq(supportChats.id, input.chatId));

      return {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        senderRole: message.senderRole,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      };
    }),

  // Public FAQ
  getPublishedFaq: publicProcedure.query(async () => {
    const articles = await db.query.faqArticles.findMany({
      where: eq(faqArticles.published, true),
      orderBy: faqArticles.category,
    });
    return articles.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      keywords: a.keywords as string[],
      category: a.category,
      published: a.published,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  }),

  searchFaq: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const articles = await db.query.faqArticles.findMany({
        where: eq(faqArticles.published, true),
      });

      const queryLower = input.query.toLowerCase();
      const filtered = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(queryLower) ||
          a.content.toLowerCase().includes(queryLower) ||
          (a.keywords as string[]).some((k: string) => k.toLowerCase().includes(queryLower))
      );

      return filtered.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        keywords: a.keywords as string[],
        category: a.category,
        published: a.published,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }));
    }),
});
