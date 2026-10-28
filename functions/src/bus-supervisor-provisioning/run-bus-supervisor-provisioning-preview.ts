import { resolve } from "node:path";

import { initializeBusSupervisorProvisioningAdmin } from "./initialize-bus-supervisor-provisioning-admin";
import { previewBusSupervisorProvisioningWorkbook } from "./bus-supervisor-provisioning-workbook";

async function main() {
  initializeBusSupervisorProvisioningAdmin();
  const inputPath = resolve(
    process.cwd(),
    process.argv[2] || "bus-supervisor-provisioning-input.local.xlsx",
  );
  const preview = await previewBusSupervisorProvisioningWorkbook(inputPath);

  console.log(JSON.stringify(preview, null, 2));
  if (
    preview.errors.length ||
    preview.summary.invalidRows ||
    preview.summary.blockedRows ||
    preview.summary.failedRows
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
