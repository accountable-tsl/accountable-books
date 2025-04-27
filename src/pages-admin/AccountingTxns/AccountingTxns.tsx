import { Coins, Proportions } from "lucide-react";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import "./AccountingTxns.scss";
import { useCompany } from "../../utils/company";
import { useEffect, useMemo, useState } from "react";
import { routes } from "../../utils/routes";
import MultiSelectDropdown from "../../components/MultiSelectDropdown/MultiSelectDropdown";
import {
  AccountingTxnFilters,
  Coa,
  MultiSelectOption,
  MultiSelectOptionGroup,
} from "../../types/types";
import { fetchCoa } from "../../services/CoaServices";
import { DatePicker } from "antd";
import { RangePickerProps } from "antd/es/date-picker";
import dayjs from "dayjs";
import { fetchGenLedgerEntries } from "../../services/TransactionServices";
import { AccountTxnTable } from "./AccountTxnTable";
import { groupOptionsBy } from "./AccountingTxnsUtils";

export default function AccountingTxns() {
  const { companyId } = useCompany();
  const startOfMonth = dayjs().startOf("month");
  const endOfMonth = dayjs().endOf("month");

  const [isLoading, setIsLoading] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [ledgerData, setLedgerData] = useState<any>([]);
  const [coaData, setCoaData] = useState<Coa[]>([]);
  const [dateFilters, setDateFilters] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({
    startDate: startOfMonth.toDate(),
    endDate: endOfMonth.toDate(),
  });
  const [filters, setFilters] = useState<AccountingTxnFilters>({
    startDate: dateFilters.startDate || startOfMonth,
    endDate: dateFilters.endDate || endOfMonth,
    accountIds: selectedAccounts,
    showContact: false,
    showProject: false,
    showCurrency: false,
    showSourceAmounts: false,
  });

  const reportBreadcrumbs = useMemo(
    () => [
      {
        text: "Reports",
        icon: Proportions,
        link: companyId ? routes.reports.root(companyId) : "#",
      },
      {
        text: "Account Transactions",
        icon: Coins,
        link: companyId ? routes.reports.coa(companyId) : "#",
        hasDropdown: false,
      },
    ],
    [companyId]
  );

  const { RangePicker } = DatePicker;

  const handleFetchCoa = async () => {
    if (companyId) {
      try {
        const coa = await fetchCoa({ companyId });

        if (coa.success) {
          setCoaData(coa.data);
        }

        if (!coa.success) {
          console.error("Failed to fetch COA:", coa);
        }
      } catch (error) {
        console.error("Failed to fetch COA:", error);
      }
    }
  };

  const groupedCoa = groupOptionsBy(coaData, "accountTypeName");

  const handleDateFilters: RangePickerProps["onChange"] = (value) => {
    if (value) {
      setDateFilters({
        startDate: value[0]?.toDate(),
        endDate: value[1]?.toDate(),
      });
    } else {
      setDateFilters({});
    }
  };

  const retrieveLedgerTxns = async () => {
    if (filters.accountIds?.length) {
      if (!companyId) return;

      try {
        setIsLoading(true);
        const response = await fetchGenLedgerEntries(companyId, filters);

        if (response.success) {
          setLedgerData(response.data);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error fetching ledger data:", error);
        setIsLoading(false);
      }
    } else {
      setLedgerData([]);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleFetchCoa();
  }, [companyId]);

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      startDate: dateFilters.startDate || startOfMonth,
      endDate: dateFilters.endDate || endOfMonth,
      accountIds: selectedAccounts,
    }));
  }, [dateFilters, selectedAccounts]);

  useEffect(() => {
    retrieveLedgerTxns();
  }, [filters]);

  console.log(dateFilters, selectedAccounts);

  return (
    <div className="atx journal">
      <div className="atx-h">
        <Breadcrumb items={reportBreadcrumbs} />
      </div>
      <div className="atx-filters">
        <div className="atx-filters-start">
          <div className="atx-filters-l">
            <MultiSelectDropdown
              options={groupedCoa}
              selectedValues={selectedAccounts}
              onChange={setSelectedAccounts}
              placeholder="Select account(s)..."
            />
          </div>

          <div className="atx-filters-r">
            <RangePicker
              onChange={handleDateFilters}
              defaultValue={[startOfMonth, endOfMonth]}
              format={"DD MMM YYYY"}
            />
          </div>
        </div>

        <div className="atx-filters-end">
          <div className="atx-filters-item atx-filters-tgc"></div>
          <div className="atx-filters-item atx-filters-exp">Export CSV</div>
        </div>
      </div>
      <div className="atx-table">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800 mx-auto"></div>
              <p className="mt-2 text-slate-600">Loading ledger data...</p>
            </div>
          </div>
        ) : ledgerData.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
            <h3 className="text-lg font-medium text-slate-800 mb-1">
              No transactions found
            </h3>
            <p className="text-slate-500">
              {filters.accountIds?.length === 0
                ? "Please select at least one account to view transactions."
                : "No transactions match your current filters."}
            </p>
          </div>
        ) : (
          <div>
            {ledgerData.map((accountData: any) => (
              <AccountTxnTable
                key={accountData.account.id}
                data={accountData}
                showContact={filters.showContact}
                showProject={filters.showProject}
                showCurrency={filters.showCurrency}
                showSourceAmounts={filters.showSourceAmounts}
              />
            ))}
          </div>
        )}
      </div>
      <div className="atx-footer"></div>
    </div>
  );
}
