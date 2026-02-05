import { router } from "../trpc";
import { authRouter } from "./auth";
import { companyRouter } from "./company";
import { interviewRouter } from "./interview";
import { processRouter } from "./process";
import { supportRouter } from "./support";
import { adminRouter } from "./admin";

export const appRouter = router({
  auth: authRouter,
  company: companyRouter,
  interview: interviewRouter,
  process: processRouter,
  support: supportRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
