import { resolve } from "node:path";

import { initializeBusSupervisorProvisioningAdmin } from "./initialize-bus-supervisor-provisioning-admin";
import { verifyBusSupervisorProvisioningWorkbook } from "./bus-supervisor-provisioning-workbook";

async function main() {
  initializeBusSupervisorProvisioningAdmin();
  const inputPath = resolve(
    process.cwd(),
    process.argv[2] || "bus-supervisor-provisioning-input.local.xlsx",
  );
  const result = await verifyBusSupervisorProvisioningWorkbook(inputPath);

  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length || result.summary.invalidRows || result.summary.failedRows) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
