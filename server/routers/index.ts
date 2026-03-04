import { router } from "../trpc";
import { authRouter } from "./auth";
import { companyRouter } from "./company";
import { interviewRouter } from "./interview";
import { processRouter } from "./process";
import { supportRouter } from "./support";
import { adminRouter } from "./admin";
import { consentRouter } from "./consent";
import { businessModelRouter } from "./businessModel";

export const appRouter = router({
  auth: authRouter,
  company: companyRouter,
  interview: interviewRouter,
  process: processRouter,
  support: supportRouter,
  admin: adminRouter,
  consent: consentRouter,
  businessModel: businessModelRouter,
});

export type AppRouter = typeof appRouter;
