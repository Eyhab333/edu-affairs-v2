import { resolve } from "node:path";

import { initializeBusSupervisorProvisioningAdmin } from "./initialize-bus-supervisor-provisioning-admin";
import { applyBusSupervisorProvisioningWorkbook } from "./bus-supervisor-provisioning-workbook";

async function main() {
  initializeBusSupervisorProvisioningAdmin();
  const inputPath = resolve(
    process.cwd(),
    process.argv[2] || "bus-supervisor-provisioning-input.local.xlsx",
  );
  const generatedCredentials: Array<{
    rowNumber: number;
    email: string;
    temporaryPassword: string;
  }> = [];
  const result = await applyBusSupervisorProvisioningWorkbook({
    inputPath,
    onGeneratedTemporaryPassword: (credential) => generatedCredentials.push(credential),
  });

  console.log(JSON.stringify(result, null, 2));
  for (const credential of generatedCredentials) {
    console.log(
      `Temporary password for row ${credential.rowNumber} (${credential.email}). Record it only in an approved password manager before sharing it through an approved secure channel:`,
    );
    console.log(credential.temporaryPassword);
  }
  if (result.errors.length || result.summary.invalidRows || result.summary.blockedRows || result.summary.failedRows) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
