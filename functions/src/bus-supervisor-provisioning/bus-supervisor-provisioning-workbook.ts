import { Workbook } from "exceljs";

import {
  applyBusSupervisorProvisioning,
  previewBusSupervisorProvisioning,
  verifyBusSupervisorProvisioning,
  type BusSupervisorProvisioningApplyResult,
  type BusSupervisorProvisioningInput,
  type BusSupervisorProvisioningPreview,
  type BusSupervisorProvisioningPreviewStatus,
  type BusSupervisorProvisioningVerificationResult,
} from "./bus-supervisor-provisioning";

const REQUIRED_COLUMNS = ["displayName", "email", "schoolId"] as const;
const SUPPORTED_COLUMNS = [
  "orgId",
  "displayName",
  "email",
  "nationalId",
  "phone",
  "schoolId",
  "title",
  "department",
  "principalPersonId",
  "initialPassword",
] as const;

type SupportedColumn = (typeof SUPPORTED_COLUMNS)[number];

export type BusSupervisorProvisioningWorkbookInput = Omit<
  BusSupervisorProvisioningInput,
  "initialPassword"
>;

export type BusSupervisorProvisioningWorkbookRow = {
  rowNumber: number;
  input: BusSupervisorProvisioningWorkbookInput;
  errors: string[];
  provisioningInput: BusSupervisorProvisioningInput;
};

export type BusSupervisorProvisioningWorkbook = {
  inputPath: string;
  worksheetName: string;
  errors: string[];
  rows: BusSupervisorProvisioningWorkbookRow[];
};

export type BusSupervisorProvisioningWorkbookPreviewRow = {
  rowNumber: number;
  input: BusSupervisorProvisioningWorkbookInput;
  status: BusSupervisorProvisioningPreviewStatus | "INVALID_INPUT" | "FAILED";
  errors: string[];
  preview?: Omit<BusSupervisorProvisioningPreview, "input"> & {
    input: BusSupervisorProvisioningWorkbookInput;
  };
};

export type BusSupervisorProvisioningWorkbookApplyRow = {
  rowNumber: number;
  input: BusSupervisorProvisioningWorkbookInput;
  status: "APPLIED" | "SKIPPED_INVALID" | "SKIPPED_BLOCKED" | "FAILED";
  errors: string[];
  result?: Omit<BusSupervisorProvisioningApplyResult, "temporaryPassword">;
};

export type BusSupervisorProvisioningWorkbookVerifyRow = {
  rowNumber: number;
  input: BusSupervisorProvisioningWorkbookInput;
  status: "VERIFIED" | "FAILED" | "SKIPPED_INVALID";
  errors: string[];
  verification?: BusSupervisorProvisioningVerificationResult;
};

type WorkbookReportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  blockedRows: number;
  failedRows: number;
  successfulRows: number;
};

function normalizedHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function text(value: string) {
  return value.trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected provisioning error.";
}

function safeInput(
  input: BusSupervisorProvisioningInput,
): BusSupervisorProvisioningWorkbookInput {
  const { initialPassword: _initialPassword, ...safe } = input;
  return safe;
}

function inputFromCells(values: Record<SupportedColumn, string>) {
  const input: BusSupervisorProvisioningInput = {
    displayName: values.displayName,
    email: values.email,
    schoolId: values.schoolId,
  };

  for (const key of SUPPORTED_COLUMNS) {
    if (key === "displayName" || key === "email" || key === "schoolId") continue;
    const value = values[key];
    if (value) input[key] = value;
  }

  return input;
}

function localValidation(input: BusSupervisorProvisioningInput) {
  const errors: string[] = [];
  if (!text(input.displayName)) errors.push("displayName is required.");
  const email = text(input.email).toLowerCase();
  if (!email) errors.push("email is required.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email is invalid.");
  if (!text(input.schoolId)) errors.push("schoolId is required.");
  if (input.initialPassword && input.initialPassword.trim().length < 8) {
    errors.push("initialPassword must contain at least 8 characters.");
  }
  return errors;
}

function addDuplicateErrors(rows: BusSupervisorProvisioningWorkbookRow[]) {
  const emailRows = new Map<string, BusSupervisorProvisioningWorkbookRow[]>();
  const nationalIdRows = new Map<string, BusSupervisorProvisioningWorkbookRow[]>();

  for (const item of rows) {
    const email = text(item.provisioningInput.email).toLowerCase();
    if (email) emailRows.set(email, [...(emailRows.get(email) || []), item]);

    const nationalId = text(item.provisioningInput.nationalId || "");
    if (nationalId) {
      nationalIdRows.set(nationalId, [...(nationalIdRows.get(nationalId) || []), item]);
    }
  }

  const markDuplicates = (
    groups: Map<string, BusSupervisorProvisioningWorkbookRow[]>,
    label: string,
  ) => {
    for (const [value, group] of groups) {
      if (group.length < 2) continue;
      const rowNumbers = group.map((item) => item.rowNumber).join(", ");
      for (const item of group) {
        item.errors.push(`${label} \"${value}\" is duplicated in rows ${rowNumbers}.`);
      }
    }
  };

  markDuplicates(emailRows, "email");
  markDuplicates(nationalIdRows, "nationalId");
}

function previewWithoutPassword(preview: BusSupervisorProvisioningPreview) {
  return { ...preview, input: safeInput(preview.input) };
}

function summary(params: {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  blockedRows?: number;
  failedRows?: number;
  successfulRows?: number;
}): WorkbookReportSummary {
  return {
    totalRows: params.totalRows,
    validRows: params.validRows,
    invalidRows: params.invalidRows,
    blockedRows: params.blockedRows || 0,
    failedRows: params.failedRows || 0,
    successfulRows: params.successfulRows || 0,
  };
}

export async function readBusSupervisorProvisioningWorkbook(
  inputPath: string,
): Promise<BusSupervisorProvisioningWorkbook> {
  const workbook = new Workbook();
  await workbook.xlsx.readFile(inputPath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return {
      inputPath,
      worksheetName: "",
      errors: ["The workbook does not contain a worksheet."],
      rows: [],
    };
  }

  const errors: string[] = [];
  const columnNumbers = new Map<SupportedColumn, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizedHeader(cell.text);
    const column = SUPPORTED_COLUMNS.find(
      (candidate) => normalizedHeader(candidate) === header,
    );
    if (!column) return;
    if (columnNumbers.has(column)) {
      errors.push(`The workbook contains duplicate \"${column}\" headers.`);
      return;
    }
    columnNumbers.set(column, columnNumber);
  });

  for (const column of REQUIRED_COLUMNS) {
    if (!columnNumbers.has(column)) {
      errors.push(`The workbook is missing the required \"${column}\" column.`);
    }
  }

  const rows: BusSupervisorProvisioningWorkbookRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const values = Object.fromEntries(
      SUPPORTED_COLUMNS.map((column) => [
        column,
        text(
          columnNumbers.has(column)
            ? worksheetRow.getCell(columnNumbers.get(column)!).text
            : "",
        ),
      ]),
    ) as Record<SupportedColumn, string>;

    if (!Object.values(values).some(Boolean)) continue;
    const provisioningInput = inputFromCells(values);
    rows.push({
      rowNumber,
      input: safeInput(provisioningInput),
      provisioningInput,
      errors: [...errors, ...localValidation(provisioningInput)],
    });
  }

  if (!rows.length && !errors.length) {
    errors.push("The workbook does not contain any supervisor rows.");
  }
  addDuplicateErrors(rows);

  return { inputPath, worksheetName: worksheet.name, errors, rows };
}

export async function previewBusSupervisorProvisioningWorkbook(inputPath: string) {
  const workbook = await readBusSupervisorProvisioningWorkbook(inputPath);
  const rows: BusSupervisorProvisioningWorkbookPreviewRow[] = [];

  for (const item of workbook.rows) {
    if (item.errors.length) {
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: "INVALID_INPUT",
        errors: item.errors,
      });
      continue;
    }

    try {
      const preview = await previewBusSupervisorProvisioning(item.provisioningInput);
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: preview.status,
        errors: preview.blockingReason ? [preview.blockingReason] : [],
        preview: previewWithoutPassword(preview),
      });
    } catch (error) {
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: "FAILED",
        errors: [errorMessage(error)],
      });
    }
  }

  const invalidRows = rows.filter((item) => item.status === "INVALID_INPUT").length;
  const blockedRows = rows.filter((item) => item.status === "BLOCKED").length;
  const failedRows = rows.filter((item) => item.status === "FAILED").length;
  return {
    ...workbook,
    rows,
    summary: summary({
      totalRows: rows.length,
      validRows: rows.length - invalidRows,
      invalidRows,
      blockedRows,
      failedRows,
      successfulRows: rows.length - invalidRows - blockedRows - failedRows,
    }),
  };
}

export async function applyBusSupervisorProvisioningWorkbook(params: {
  inputPath: string;
  onGeneratedTemporaryPassword?: (credential: {
    rowNumber: number;
    email: string;
    temporaryPassword: string;
  }) => void;
}) {
  const workbook = await readBusSupervisorProvisioningWorkbook(params.inputPath);
  const rows: BusSupervisorProvisioningWorkbookApplyRow[] = [];

  for (const item of workbook.rows) {
    if (item.errors.length) {
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: "SKIPPED_INVALID",
        errors: item.errors,
      });
      continue;
    }

    try {
      const preview = await previewBusSupervisorProvisioning(item.provisioningInput);
      if (preview.status === "BLOCKED") {
        rows.push({
          rowNumber: item.rowNumber,
          input: item.input,
          status: "SKIPPED_BLOCKED",
          errors: preview.blockingReason ? [preview.blockingReason] : [],
        });
        continue;
      }

      const result = await applyBusSupervisorProvisioning(item.provisioningInput);
      const { temporaryPassword, ...safeResult } = result;
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: "APPLIED",
        errors: [],
        result: safeResult,
      });
      if (temporaryPassword) {
        params.onGeneratedTemporaryPassword?.({
          rowNumber: item.rowNumber,
          email: item.provisioningInput.email,
          temporaryPassword,
        });
      }
    } catch (error) {
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: "FAILED",
        errors: [errorMessage(error)],
      });
    }
  }

  const invalidRows = rows.filter((item) => item.status === "SKIPPED_INVALID").length;
  const blockedRows = rows.filter((item) => item.status === "SKIPPED_BLOCKED").length;
  const failedRows = rows.filter((item) => item.status === "FAILED").length;
  return {
    ...workbook,
    rows,
    summary: summary({
      totalRows: rows.length,
      validRows: rows.length - invalidRows,
      invalidRows,
      blockedRows,
      failedRows,
      successfulRows: rows.filter((item) => item.status === "APPLIED").length,
    }),
  };
}

export async function verifyBusSupervisorProvisioningWorkbook(inputPath: string) {
  const workbook = await readBusSupervisorProvisioningWorkbook(inputPath);
  const rows: BusSupervisorProvisioningWorkbookVerifyRow[] = [];

  for (const item of workbook.rows) {
    if (item.errors.length) {
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: "SKIPPED_INVALID",
        errors: item.errors,
      });
      continue;
    }

    try {
      const verification = await verifyBusSupervisorProvisioning(item.provisioningInput);
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: verification.passed ? "VERIFIED" : "FAILED",
        errors: verification.passed
          ? []
          : verification.checks.filter((check) => !check.passed).map((check) => check.message),
        verification,
      });
    } catch (error) {
      rows.push({
        rowNumber: item.rowNumber,
        input: item.input,
        status: "FAILED",
        errors: [errorMessage(error)],
      });
    }
  }

  const invalidRows = rows.filter((item) => item.status === "SKIPPED_INVALID").length;
  const failedRows = rows.filter((item) => item.status === "FAILED").length;
  return {
    ...workbook,
    rows,
    summary: summary({
      totalRows: rows.length,
      validRows: rows.length - invalidRows,
      invalidRows,
      failedRows,
      successfulRows: rows.filter((item) => item.status === "VERIFIED").length,
    }),
  };
}
