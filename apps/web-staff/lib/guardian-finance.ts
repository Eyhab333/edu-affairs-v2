import type {
  GuardianLink,
  GuardianPayment,
  StudentFeeCharge,
  StudentFeeInstallment,
} from "@takween/contracts";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type GuardianFinanceSearchResult = {
  kind: "GUARDIAN" | "STUDENT";
  id: string;
  personId: string;
  displayName: string;
  nationalId: string;
  phone: string;
};

export type GuardianFinanceStudent = {
  id: string;
  personId: string;
  displayName: string;
  nationalId: string;
};

export type GuardianFinanceReceipt = {
  id: string;
  paymentId: string;
  receiptNumber: string;
  status: string;
  currency: string;
  amountMinor: number;
  issuedAt: number;
};

export type GuardianFinanceWorkspace = {
  guardian: {
    id: string;
    personId: string;
    displayName: string;
    nationalId: string;
    phone: string;
  };

  guardianLinks: GuardianLink[];
  students: GuardianFinanceStudent[];

  charges: StudentFeeCharge[];
  installments: StudentFeeInstallment[];
  payments: GuardianPayment[];
  receipts: GuardianFinanceReceipt[];

  studentSummaries: unknown[];
  summary: unknown;
};
export type ReverseGuardianPaymentInput = {
  orgId: string;
  paymentId: string;
  reversalReason: string;
};

export type ReverseGuardianPaymentResult = {
  ok: true;
  paymentId: string;
  status: "REVERSED";
  chargeIds: string[];
  installmentIds: string[];
  receiptCancelled: boolean;
};

type GetGuardianFinanceWorkspaceInput = {
  orgId: string;

  query?: string;
  guardianId?: string;
  studentId?: string;

  schoolId?: string;
  academicYearId?: string;
  termId?: string;

  limit?: number;
};

type GetGuardianFinanceWorkspaceResult = {
  ok: true;
  searchResults: GuardianFinanceSearchResult[];
  workspace?: GuardianFinanceWorkspace;
};

export type CreateStudentFeeChargeInput = {
  orgId: string;
  schoolId: string;
  academicYearId: string;

  termId?: string;
  termTitle?: string;
  termShortTitle?: string;

  studentId: string;
  guardianId?: string;

  feeDefinitionId: string;

  originalAmountMinor?: number;
  dueAt?: number;
  installmentCount?: number;

  activateImmediately?: boolean;
  isGuardianVisible?: boolean;
};

export type CreateStudentFeeChargeResult = {
  ok: true;
  chargeId: string;
  installmentIds: string[];
  status: string;
};

export type GuardianFinancePaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CARD"
  | "CHEQUE"
  | "ONLINE"
  | "OTHER";

export type CreateGuardianPaymentDraftInput = {
  orgId: string;
  guardianId: string;

  amountMinor: number;
  paymentMethod: GuardianFinancePaymentMethod;
  paidAt?: number;

  schoolIds?: string[];
  academicYearIds?: string[];
  termIds?: string[];

  referenceNumber?: string;
  bankName?: string;
  transferDate?: number;
  chequeNumber?: string;
  cardLast4?: string;

  note?: string;
};

export type CreateGuardianPaymentDraftResult = {
  ok: true;
  paymentId: string;
  receiptNumber: string;
  status: "DRAFT";
};

export type PostGuardianPaymentAllocationInput = {
  studentId: string;
  chargeId: string;
  installmentId?: string;
  amountMinor: number;
  note?: string;
};

export type PostGuardianPaymentInput = {
  orgId: string;
  paymentId: string;
  allocations: PostGuardianPaymentAllocationInput[];
};

export type PostGuardianPaymentResult = {
  ok: true;
  paymentId: string;
  receiptId: string;
  receiptNumber: string;
  status: "POSTED";
  allocatedAmountMinor: number;
  chargeIds: string[];
  installmentIds: string[];
};

const createStudentFeeChargeCallable = httpsCallable<
  CreateStudentFeeChargeInput,
  CreateStudentFeeChargeResult
>(functions, "createStudentFeeCharge");

export async function createStudentFeeCharge(
  input: CreateStudentFeeChargeInput,
): Promise<CreateStudentFeeChargeResult> {
  const response = await createStudentFeeChargeCallable(input);
  return response.data;
}

const createGuardianPaymentDraftCallable = httpsCallable<
  CreateGuardianPaymentDraftInput,
  CreateGuardianPaymentDraftResult
>(functions, "createGuardianPaymentDraft");

export async function createGuardianPaymentDraft(
  input: CreateGuardianPaymentDraftInput,
): Promise<CreateGuardianPaymentDraftResult> {
  const response = await createGuardianPaymentDraftCallable(input);

  return response.data;
}

const postGuardianPaymentCallable = httpsCallable<
  PostGuardianPaymentInput,
  PostGuardianPaymentResult
>(functions, "postGuardianPayment");

export async function postGuardianPayment(
  input: PostGuardianPaymentInput,
): Promise<PostGuardianPaymentResult> {
  const response = await postGuardianPaymentCallable(input);
  return response.data;
}

const reverseGuardianPaymentCallable = httpsCallable<
  ReverseGuardianPaymentInput,
  ReverseGuardianPaymentResult
>(functions, "reverseGuardianPayment");

export async function reverseGuardianPayment(
  input: ReverseGuardianPaymentInput,
): Promise<ReverseGuardianPaymentResult> {
  const response = await reverseGuardianPaymentCallable(input);

  return response.data;
}

const getWorkspaceCallable = httpsCallable<
  GetGuardianFinanceWorkspaceInput,
  GetGuardianFinanceWorkspaceResult
>(functions, "getGuardianFinanceWorkspace");

export async function getGuardianFinanceWorkspace(
  input: GetGuardianFinanceWorkspaceInput,
): Promise<GetGuardianFinanceWorkspaceResult> {
  const response = await getWorkspaceCallable(input);
  return response.data;
}
