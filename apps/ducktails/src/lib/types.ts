export interface DatabaseEntry {
  id: string;
  name: string;
  app: string;
  path: string;
}

export interface DatabaseInfo extends DatabaseEntry {
  status: "online" | "not_found" | "locked" | "error";
  tableCount: number;
  fileSize: number;
  error?: string;
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface TableSummary {
  name: string;
  rowCount: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
}

export type FilterOperator =
  | "contains"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_null"
  | "is_not_null"
  | "is_true"
  | "is_false";

export interface ColumnFilter {
  column: string;
  operator: FilterOperator;
  value?: string;
}

export interface DataPage {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
}
