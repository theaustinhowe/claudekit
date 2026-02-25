/**
 * Validate that an identifier (table name, column name) is safe for SQL interpolation.
 * Only allows alphanumeric, underscore, and must start with letter or underscore.
 */
export function validateIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Quote an identifier for safe SQL interpolation.
 * Uses double-quote escaping per SQL standard.
 */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Format a cell value for display.
 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    if (value instanceof Uint8Array) return `[BLOB: ${value.length} bytes]`;
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** i;
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
