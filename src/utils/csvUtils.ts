import fs from "fs";
import csv from "csv-parser";

// Generic CSV Parsing Function
export function parseCSVFile(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => {
        console.error(`Error parsing CSV file ${filePath}:`, error);
        reject(error);
      });
  });
}

export function validateCSVRow(row: any, requiredFields: string[]): boolean {
  for (const field of requiredFields) {
    if (!row[field]) {
      return false;
    }
  }
  return true;
}

const userUploadedHeaders = ["Account No", "Acc Name", "Acc Type"];
const dbHeaders = ["accountCode", "accountName", "accountTypeId"];

// Allow user to map like
const headerMap = {
  "Account No": "accountCode",
  "Acc Name": "accountName",
  "Acc Type": "accountTypeId",
};

// Use this mapping to process the data later
