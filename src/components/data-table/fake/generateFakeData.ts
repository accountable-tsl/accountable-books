import path from "path";
import { Account, generateCompanyAccounts } from "./seed";
import fs from "fs";

export const data = [
  ...generateCompanyAccounts("COMP01"),
  ...generateCompanyAccounts("COMP02"),
  ...generateCompanyAccounts("COMP03"),
];

// Save to file
fs.writeFileSync("coa-data.json", JSON.stringify(data, null, 2));
console.log("✅ Generated 1500 accounts in coa-data.json");
