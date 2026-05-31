export type DataProvider = "mock" | "api";

export function getDataProvider(): DataProvider {
  const provider = process.env.NEXT_PUBLIC_DATA_PROVIDER;
  return provider === "api" ? "api" : "mock";
}
