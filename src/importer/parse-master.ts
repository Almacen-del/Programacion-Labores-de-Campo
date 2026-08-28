import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import readXlsxFile, { type CellValue, type Sheet } from "read-excel-file/node";
import type { ParsedAlert, ParsedLaborRecord, ParsedMasterWorkbook, ParsedSheet } from "./types.ts";

const EXPECTED_SHEETS = new Set([
  "siembras nuevas",
  "siembra de produccion",
  "plateo mecanico",
]);

const HEADER_ALIASES: Record<string, string> = {
  dia: "day",
  mes: "month",
  ano: "year",
  colaborador: "collaborator",
  "ano siembra": "plantingYear",
  lote: "lot",
  actividad: "labor",
  insumo: "input",
  unidad: "unit",
  cantidad: "quantity",
  dosis: "dose",
  maquinaria: "machinery",
  observacion: "observation",
};

type HeaderField = (typeof HEADER_ALIASES)[keyof typeof HEADER_ALIASES];
type SheetCell = CellValue | null;

export function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es-CO");
}

function textValue(value: SheetCell | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

function finiteInteger(value: SheetCell | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = textValue(value);
  if (!text || !/^-?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function finiteNumber(value: SheetCell | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = textValue(value);
  if (!text || !/^-?\d+(?:[.,]\d+)?$/.test(text)) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDate(dayValue: SheetCell | undefined, monthValue: SheetCell | undefined, yearValue: SheetCell | undefined): string | null {
  const day = finiteInteger(dayValue);
  const month = finiteInteger(monthValue);
  const year = finiteInteger(yearValue);
  if (day === null || month === null || year === null || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findHeader(rows: SheetCell[][]): { rowIndex: number; columns: Map<HeaderField, number> } | null {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const columns = new Map<HeaderField, number>();
    rows[rowIndex].forEach((value, columnIndex) => {
      const field = HEADER_ALIASES[normalizeKey(value)];
      if (field) columns.set(field, columnIndex);
    });
    if (["day", "month", "year", "lot", "labor"].every((field) => columns.has(field))) {
      return { rowIndex, columns };
    }
  }
  return null;
}

function isBlankRow(row: SheetCell[]): boolean {
  return row.every((value) => textValue(value) === null);
}

function getCell(row: SheetCell[], columns: Map<HeaderField, number>, field: HeaderField): SheetCell | undefined {
  const index = columns.get(field);
  return index === undefined ? undefined : row[index];
}

function alert(code: string, severity: ParsedAlert["severity"], field: string | null, message: string): ParsedAlert {
  return { code, severity, field, message };
}

function hasMultipleLots(lot: string): boolean {
  return /[,;\/]|\s+y\s+/i.test(lot);
}

function stableRecordHash(values: unknown): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export function parseSheets(sheets: Sheet[]): Pick<ParsedMasterWorkbook, "sheets" | "records" | "summary"> {
  const parsedSheets: ParsedSheet[] = [];
  const records: ParsedLaborRecord[] = [];
  const seenHashes = new Set<string>();

  for (const sheet of sheets) {
    const expected = EXPECTED_SHEETS.has(normalizeKey(sheet.sheet));
    const header = expected ? findHeader(sheet.data) : null;
    if (!expected || !header) {
      parsedSheets.push({
        name: sheet.sheet,
        status: "IGNORED",
        profile: null,
        headerRow: null,
        rowCount: sheet.data.length,
        importedRowCount: 0,
        reason: expected ? "No se encontró la firma de encabezados requerida." : "Hoja fuera de los perfiles aprobados.",
      });
      continue;
    }

    let importedRowCount = 0;
    for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex += 1) {
      const row = sheet.data[rowIndex];
      if (isBlankRow(row)) continue;

      const alerts: ParsedAlert[] = [];
      const workDate = buildDate(
        getCell(row, header.columns, "day"),
        getCell(row, header.columns, "month"),
        getCell(row, header.columns, "year"),
      );
      const collaborator = textValue(getCell(row, header.columns, "collaborator"));
      const plantingYear = finiteInteger(getCell(row, header.columns, "plantingYear"));
      const lot = textValue(getCell(row, header.columns, "lot"));
      // Exclusión reevaluada en cada lectura: completar ambos campos reincorpora la fila.
      if (plantingYear === null || lot === null) continue;
      const labor = textValue(getCell(row, header.columns, "labor"));
      const input = textValue(getCell(row, header.columns, "input"));
      const unit = textValue(getCell(row, header.columns, "unit"));
      const quantityCell = getCell(row, header.columns, "quantity");
      const quantity = finiteNumber(quantityCell);
      const quantityRaw = textValue(quantityCell);
      const dose = finiteNumber(getCell(row, header.columns, "dose"));
      const machinery = textValue(getCell(row, header.columns, "machinery"));
      const observation = textValue(getCell(row, header.columns, "observation"));

      if (!workDate) alerts.push(alert("INVALID_DATE", "BLOCKING", "workDate", "La fecha está incompleta o no es válida."));
      if (!labor) alerts.push(alert("MISSING_LABOR", "BLOCKING", "labor", "La fila no identifica una actividad."));
      if (!collaborator) alerts.push(alert("MISSING_COLLABORATOR", "WARNING", "collaborator", "La fila no identifica un colaborador."));
      if (lot && hasMultipleLots(lot)) alerts.push(alert("MULTIPLE_LOTS_IN_CELL", "WARNING", "lot", "La celda parece contener más de un lote y requiere revisión."));
      if (quantityRaw && quantity === null && normalizeKey(quantityRaw) !== "n/a") {
        alerts.push(alert("NON_NUMERIC_QUANTITY", "WARNING", "quantity", "La cantidad no pudo interpretarse como número."));
      }

      const businessValues = { workDate, collaborator, plantingYear, lot, labor, input, unit, quantity, quantityRaw, dose, machinery, observation };
      const recordHash = stableRecordHash(businessValues);
      if (seenHashes.has(recordHash)) alerts.push(alert("EXACT_DUPLICATE", "WARNING", null, "Existe otra fila con los mismos datos en esta carga."));
      seenHashes.add(recordHash);

      const validationState = alerts.some((item) => item.severity === "BLOCKING")
        ? "BLOCKED"
        : alerts.some((item) => item.severity === "WARNING")
          ? "OBSERVED"
          : "VALID";

      records.push({
        sourceSheet: sheet.sheet,
        sourceRow: rowIndex + 1,
        sourceProfile: normalizeKey(sheet.sheet),
        recordHash,
        rawValues: row,
        ...businessValues,
        validationState,
        alerts,
      });
      importedRowCount += 1;
    }

    parsedSheets.push({
      name: sheet.sheet,
      status: "IMPORTED",
      profile: normalizeKey(sheet.sheet),
      headerRow: header.rowIndex + 1,
      rowCount: sheet.data.length,
      importedRowCount,
      reason: null,
    });
  }

  const summary = {
    total: records.length,
    valid: records.filter((record) => record.validationState === "VALID").length,
    observed: records.filter((record) => record.validationState === "OBSERVED").length,
    blocked: records.filter((record) => record.validationState === "BLOCKED").length,
    alerts: records.reduce((count, record) => count + record.alerts.length, 0),
  };
  return { sheets: parsedSheets, records, summary };
}

// Prototipo WEB 1: recibe bytes de servidor, nunca una ruta local del usuario.
// Regla web adicional: lote y año de siembra obligatorios para incluir una fila.
export async function parseMasterBytes(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new Error("El maestro está vacío.");
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("El archivo supera el límite de seguridad de 25 MB.");
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const sheets = await readXlsxFile(Buffer.from(bytes), { trim: false });
  const parsed = parseSheets(sheets);
  if (!parsed.sheets.some((sheet) => sheet.status === "IMPORTED")) {
    throw new Error("El archivo no contiene ninguno de los tres perfiles aprobados del maestro MA-F-009.");
  }

  return {
    fileSize: bytes.byteLength,
    fileHash,
    parsedAt: new Date().toISOString(),
    ...parsed,
  };
}
