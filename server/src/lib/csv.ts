// Minimal RFC-4180-ish CSV serializer — no dependency needed for this app's
// scale. Quotes any field containing a comma, quote, or newline, doubling
// embedded quotes.
function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T extends object>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((col) => escapeCsvField(col)).join(',');
  const body = rows.map((row) => columns.map((col) => escapeCsvField(row[col])).join(','));
  return [header, ...body].join('\r\n');
}
