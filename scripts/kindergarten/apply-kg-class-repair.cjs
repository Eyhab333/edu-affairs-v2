"use strict";

const { APPLY_TOKEN, runRepair } = require("./kg-class-repair-core.cjs");

const applyArguments = process.argv.filter((argument) => argument.startsWith("--apply"));
const exactApply = `--apply=${APPLY_TOKEN}`;

if (applyArguments.length > 0 && !applyArguments.includes(exactApply)) {
  console.error(`Apply requires exactly ${exactApply}. No writes were performed.`);
  process.exitCode = 1;
} else {
  runRepair({ apply: applyArguments.includes(exactApply) }).catch((error) => {
    console.error("KG class repair apply failed:");
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
