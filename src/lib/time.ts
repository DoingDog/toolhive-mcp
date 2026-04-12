export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function formatTime(timezone = "UTC", date = new Date()): {
  timezone: string;
  iso: string;
  local: string;
  unix: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "long"
  });

  return {
    timezone,
    iso: date.toISOString(),
    local: formatter.format(date),
    unix: Math.floor(date.getTime() / 1000)
  };
}
