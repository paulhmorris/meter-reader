export type HealthReport = {
  status: "ok" | "error";
  database: "ok" | "error";
  error?: string;
};

/** Prisma puts the useful part of a connection failure on `code`, not in the message. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message = error.message.replaceAll(/\s+/g, " ").trim();
  return [code, message].filter(Boolean).join(": ");
}

export async function checkHealth(probeDatabase: () => Promise<unknown>): Promise<HealthReport> {
  try {
    await probeDatabase();
    return { status: "ok", database: "ok" };
  } catch (error) {
    return { status: "error", database: "error", error: describe(error) };
  }
}
