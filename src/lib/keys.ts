export function parseKeyList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

export function pickRandomKey(keys: string[]): string | undefined {
  if (keys.length === 0) return undefined;
  if (keys.length === 1) return keys[0];
  return keys[Math.floor(Math.random() * keys.length)];
}
