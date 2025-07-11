import { DataTable } from "./data-table";
import { accountColumns } from "./fake/columns";
import { Account, generateCompanyAccounts } from "./fake/seed";
import { useDataTable } from "./hooks";

export function Table() {
  const generateData = () => {
    const accounts = [
      ...generateCompanyAccounts("COMP01"),
      ...generateCompanyAccounts("COMP02"),
      ...generateCompanyAccounts("COMP03"),
    ];
    const blob = new Blob([JSON.stringify(accounts, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coa-data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  // const table = useDataTable<Account>(accounts, accountColumns);

  return (
    <div>
      {/* <DataTable table={table} /> */}
      <button
        onClick={generateData}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Download COA Data
      </button>
    </div>
  );
}
