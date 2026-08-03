import { getFirestore } from "firebase-admin/firestore";

import {
  SchoolScopeGroupSchema,
  StaffProvisioningInputSchema,
  type SchoolScopeGroup,
  type StaffProvisioningInput,
} from "@takween/contracts";

export type ResolvedStaffProvisioningScope = {
  input: StaffProvisioningInput;

  schoolIds: string[];
  scopeGroupIds: string[];

  primarySchoolId: string;

  groups: SchoolScopeGroup[];
};

function uniqueNonEmptyStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

async function resolveScopeGroups(params: {
  orgId: string;
  scopeGroupIds: string[];
}) {
  if (params.scopeGroupIds.length === 0) {
    return [];
  }

  const db = getFirestore();

  const snapshots = await Promise.all(
    params.scopeGroupIds.map((groupId) =>
      db
        .doc(
          `orgs/${params.orgId}/schoolScopeGroups/${groupId}`,
        )
        .get(),
    ),
  );

  return snapshots.map((snapshot, index) => {
    const requestedGroupId =
      params.scopeGroupIds[index];

    if (!snapshot.exists) {
      throw new Error(
        `مجموعة نطاق المدارس غير موجودة: ${requestedGroupId}`,
      );
    }

    const group = SchoolScopeGroupSchema.parse({
      ...snapshot.data(),

      id: snapshot.id,
      orgId: params.orgId,
    });

    if (!group.isActive) {
      throw new Error(
        `مجموعة نطاق المدارس غير نشطة: ${group.id}`,
      );
    }

    return group;
  });
}

async function ensureSchoolsExist(params: {
  orgId: string;
  schoolIds: string[];
}) {
  const db = getFirestore();

  const snapshots = await Promise.all(
    params.schoolIds.map((schoolId) =>
      db
        .doc(
          `orgs/${params.orgId}/schools/${schoolId}`,
        )
        .get(),
    ),
  );

  const missingSchoolIds = snapshots
    .map((snapshot, index) => ({
      exists: snapshot.exists,
      schoolId: params.schoolIds[index],
    }))
    .filter((item) => !item.exists)
    .map((item) => item.schoolId);

  if (missingSchoolIds.length > 0) {
    throw new Error(
      `مدارس النطاق غير موجودة: ${missingSchoolIds.join(", ")}`,
    );
  }
}

export async function resolveStaffProvisioningScope(
  rawInput: StaffProvisioningInput,
): Promise<ResolvedStaffProvisioningScope> {
  const input =
    StaffProvisioningInputSchema.parse(rawInput);

  const scopeGroupIds = uniqueNonEmptyStrings(
    input.scopeGroupIds,
  );

  const groups = await resolveScopeGroups({
    orgId: input.orgId,
    scopeGroupIds,
  });

  const schoolIds = uniqueNonEmptyStrings([
    input.schoolId,
    ...input.schoolIds,
    ...groups.flatMap(
      (group) => group.schoolIds,
    ),
  ]);

  if (schoolIds.length === 0) {
    throw new Error(
      "لم ينتج عن نطاق تجهيز الموظف أي مدرسة.",
    );
  }

  await ensureSchoolsExist({
    orgId: input.orgId,
    schoolIds,
  });

  const primarySchoolId =
    input.schoolId || schoolIds[0];

  /*
   * نعيد بناء Input كامل يحتوي على المدارس المحلولة.
   * هذا هو الشكل الذي يُرسل إلى Domain ثم Apply وVerify.
   */
  const resolvedInput =
    StaffProvisioningInputSchema.parse({
      ...input,

      schoolId: primarySchoolId,
      schoolIds,
      scopeGroupIds,
    });

  return {
    input: resolvedInput,

    schoolIds,
    scopeGroupIds,

    primarySchoolId,

    groups,
  };
}