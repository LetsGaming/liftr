/** RFC 4180-ish CSV encoding for the data export. CRLF line endings, quote
 * only fields that need it — keeps small exports readable when opened as plain text too. */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escape = (v: string | number | boolean | null | undefined) => {
    if (v == null) return "";
    let s = String(v);
    // Formula/DDE injection: a spreadsheet app (Excel/Sheets/LibreOffice) treats a cell starting
    // with =, +, -, or @ as a formula to evaluate on open. A leading `'` forces text-literal
    // interpretation in every one of those apps without changing the visible value. Must run
    // before the quote-wrapping below so the prefix survives being wrapped in quotes.
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return lines.join("\r\n") + "\r\n";
}
