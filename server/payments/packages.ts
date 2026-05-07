export const TOKEN_PACKAGES = [
  { id: "start", name: "Старт",   tokens: 5_000,  amount: 49_000 },
  { id: "basic", name: "Базовый", tokens: 15_000, amount: 99_000 },
  { id: "pro",   name: "Профи",   tokens: 50_000, amount: 249_000 },
] as const;

export type PackageId = typeof TOKEN_PACKAGES[number]["id"];
