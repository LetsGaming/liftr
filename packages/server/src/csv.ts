/** RFC 4180-ish CSV encoding for the data export (plan Phase 6.5). CRLF line endings, quote
 * only fields that need it — keeps small exports readable when opened as plain text too. */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escape = (v: string | number | boolean | null | undefined) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return lines.join("\r\n") + "\r\n";
}
