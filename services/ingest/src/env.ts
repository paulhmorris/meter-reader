export function requireEnv(name: string, source: NodeJS.ProcessEnv = process.env): string {
  const value = source[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
