export function monthRange(month: string): { start: string; end: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const start = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(Date.UTC(year, monthNum, 1));
  const end = nextMonthDate.toISOString().slice(0, 10);
  return { start, end };
}

export function previousMonth(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const previous = new Date(Date.UTC(year, monthNum - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  return new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleDateString("en-GB", { month: "short" });
}
