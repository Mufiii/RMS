/** Order numbers are `PREFIX-0001`, counted for all time (no financial year). Safe to import on the client. */
export function formatOrderNo(prefix: string, n: number): string {
  const p = prefix.replace(/-+$/, "") || "ORD";
  return `${p}-${String(n).padStart(4, "0")}`;
}
