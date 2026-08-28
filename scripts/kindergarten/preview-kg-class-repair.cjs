"use strict";

const { runRepair } = require("./kg-class-repair-core.cjs");

runRepair({ apply: false }).catch((error) => {
  console.error("KG class repair preview failed:");
  console.error(error.stack || error);
  process.exitCode = 1;
});
