export type AlertSeverity = "BLOCKING" | "WARNING" | "INFO";
export type ValidationState = "VALID" | "OBSERVED" | "BLOCKED";

export interface ParsedAlert {
  code: string;
  severity: AlertSeverity;
  field: string | null;
  message: string;
}

export interface ParsedLaborRecord {
  sourceSheet: string;
  sourceRow: number;
  sourceProfile: string;
  recordHash: string;
  rawValues: unknown[];
  workDate: string | null;
  collaborator: string | null;
  plantingYear: number | null;
  lot: string | null;
  labor: string | null;
  input: string | null;
  unit: string | null;
  quantity: number | null;
  quantityRaw: string | null;
  dose: number | null;
  machinery: string | null;
  observation: string | null;
  validationState: ValidationState;
  alerts: ParsedAlert[];
}

export interface ParsedSheet {
  name: string;
  status: "IMPORTED" | "IGNORED";
  profile: string | null;
  headerRow: number | null;
  rowCount: number;
  importedRowCount: number;
  reason: string | null;
}

export interface ParsedMasterWorkbook {
  filePath: string;
  fileName: string;
  fileSize: number;
  fileModifiedAt: string;
  fileHash: string;
  parsedAt: string;
  sheets: ParsedSheet[];
  records: ParsedLaborRecord[];
  summary: {
    total: number;
    valid: number;
    observed: number;
    blocked: number;
    alerts: number;
  };
}
