import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AccountTxnTableProps } from "../../types/types";
import numeral from "numeral";
import Decimal from "decimal.js";

export function AccountTxnTable({
  data,
  showContact,
  showProject,
  showCurrency,
  showSourceAmounts,
}: AccountTxnTableProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const sortedTransactions = [...data.transactions].sort((a, b) => {
    const aDate = new Date(a.date).getTime();
    const bDate = new Date(b.date).getTime();
    return sortDirection === "asc" ? aDate - bDate : bDate - aDate;
  });

  const toggleSort = () => {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  };

  // Calculate running balance
  let runningBalance = data.openingBalance;

  return (
    <div className="mb-8 bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div
        className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
            <h3 className="font-medium">
              {data.account.accountCode} - {data.account.accountName}
            </h3>
          </div>
          <p className="text-sm text-slate-500 ml-6">
            {data.account.accountTypeName}
          </p>
        </div>

        <div className="text-right">
          <div className="text-sm font-medium">
            Opening: {numeral(data.openingBalance).format("0,0.00")}
          </div>
          <div className="text-sm font-medium">
            Closing: {numeral(data.closingBalance).format("0,0.00")}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <button
                    className="flex items-center gap-1 hover:text-slate-700"
                    onClick={toggleSort}
                  >
                    Date
                    {sortDirection === "asc" ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                </th>
                <th className="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Description
                </th>
                {showContact && (
                  <th className="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Contact
                  </th>
                )}
                {showProject && (
                  <th className="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Project
                  </th>
                )}
                {showCurrency && (
                  <th className="p-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Currency
                  </th>
                )}
                {showSourceAmounts && (
                  <>
                    <th className="p-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Debit (Source)
                    </th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Credit (Source)
                    </th>
                  </>
                )}
                <th className="p-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Debit
                </th>
                <th className="p-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Credit
                </th>
                <th className="p-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((transaction, index) => {
                // Calculate running balance for this transaction
                runningBalance = runningBalance.plus(
                  new Decimal(transaction.debitAmount).minus(
                    new Decimal(transaction.creditAmount)
                  )
                );
                return (
                  <tr
                    key={transaction.id}
                    className={` hover:bg-slate-50
                      ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                    `}
                  >
                    <td className="p-3 text-sm whitespace-nowrap">
                      {transaction.date}
                    </td>
                    <td className="p-3 text-sm">{transaction.description}</td>
                    {showContact && (
                      <td className="p-3 text-sm">
                        {transaction.contact?.name || "-"}
                      </td>
                    )}
                    {showProject && (
                      <td className="p-3 text-sm">
                        {transaction.project?.name || "-"}
                      </td>
                    )}
                    {showCurrency && (
                      <td className="p-3 text-sm">{transaction.currency}</td>
                    )}
                    {showSourceAmounts && (
                      <>
                        <td className="p-3 text-sm text-right font-mono">
                          {transaction.debitSource
                            ? numeral(transaction.debitSource).format("0,0.00")
                            : ""}
                        </td>
                        <td className="p-3 text-sm text-right font-mono">
                          {transaction.creditSource
                            ? numeral(transaction.creditSource).format("0,0.00")
                            : ""}
                        </td>
                      </>
                    )}
                    <td className="p-3 text-sm text-right font-mono">
                      {transaction.debitAmount
                        ? numeral(transaction.debitAmount).format("0,0.00")
                        : ""}
                    </td>
                    <td className="p-3 text-sm text-right font-mono">
                      {transaction.creditAmount
                        ? numeral(transaction.creditAmount).format("0,0.00")
                        : ""}
                    </td>
                    <td className="p-3 text-sm text-right font-mono">
                      {numeral(runningBalance).format("0,0.00")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
