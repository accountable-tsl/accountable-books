import { useEffect, useState } from "react";
import { FolderCog, TableProperties } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { BeatLoader } from "react-spinners";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import AccountingSetup from "../../components/AccountingSetup/AccountingSetup";
import { useCompany } from "@/domains/company/store";
import { routes } from "@/shared/routes/routes";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";

import "./FinancialSettings.scss";
import TabNavigation from "../../components/TabNavigation/TabNavigation";
import { TabConfig } from "../../shared/types/core";
import { getCompanyDetails as fetchCompany } from "@/domains/company/api";

export default function FinancialSettings() {
  const { companyId } = useCompany();

  const [selectedMonth, setSelectedMonth] = useState<string>("December");
  const [selectedDay, setSelectedDay] = useState<string>("31");
  const [lockDate, setLockDate] = useState<string>("");
  const [daysInMonth, setDaysInMonth] = useState<number[]>([]);
  const [companyData, setCompanyData] = useState<any>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [_activeTab, setActiveTab] = useState("settings");

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        if (companyId) {
          const company = await fetchCompany(companyId);
          if (company.success) {
            setCompanyData(company.data);
          } else {
            setError("Failed to fetch company data");
          }
        }
      } catch (error) {
        setError("An error occurred while fetching company data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  useEffect(() => {
    updateDaysInMonth(selectedMonth);
  }, [selectedMonth]);

  const updateDaysInMonth = (month: string) => {
    const monthIndex = months.indexOf(month);
    const year = new Date().getFullYear();
    const daysCount = new Date(year, monthIndex + 1, 0).getDate();
    setDaysInMonth(Array.from({ length: daysCount }, (_, i) => i + 1));
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    setSelectedDay("1"); // Reset day when month changes
  };

  const handleDayChange = (day: string) => {
    setSelectedDay(day);
  };

  if (isLoading) return <BeatLoader color="#ffcc99" />;
  if (error) return <div>Error: {error}</div>;

  const {
    reportingCurrencyCode,
    reportingCurrencyName,
    reportingCurrencySymbol,
  } = companyData || {};

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const coaPageBreadcrumbs = [
    {
      text: "Workspace",
      icon: TableProperties,
      link: routes.accounting.workspace.root(companyId),
    },
    {
      text: "Setup",
      icon: FolderCog,
      hasDropdown: true,
      dropdownItems: [
        {
          text: "Chart of accounts",
          link: routes.accounting.setup.coa(companyId),
        },
        { text: "Contacts" },
        { text: "Projects" },
        {
          text: "Financial Settings",
          link: routes.accounting.setup.finSettings(companyId),
        },
      ],
    },
  ];

  const accountingSetupTabs: TabConfig[] = [
    {
      label: "Chart of Accounts",
      key: "coa",
      link: routes.accounting.setup.coa(companyId),
      className: "coa-tab__first",
    },
    {
      label: "Contacts",
      key: "contacts",
      link: routes.accounting.setup.contacts(companyId),
      className: "coa-tab__item--contacts",
    },
    {
      label: "Projects",
      key: "projects",
      link: routes.accounting.setup.projects(companyId),
      className: "coa-tab__item--projects",
    },
    {
      label: "Financial Settings",
      key: "settings",
      link: routes.accounting.setup.finSettings(companyId),
      className: "coa-tab__item--fin-settings",
    },
  ];

  return (
    <div className="finsettings">
      <div className="finsettings-top">
        <Breadcrumb items={coaPageBreadcrumbs} />
        <TabNavigation
          tabs={accountingSetupTabs}
          activeTab="settings"
          onTabChange={handleTabChange}
        />
      </div>

      <div className="finsettings-bottom">
        <div className="finsettings-container">
          <div className="finsettings-container__1 finsettings-item">
            <p className="finsettings-item__header">
              Base Currency -{" "}
              <span className="finsettings-item__header-curr">
                {reportingCurrencyCode} ({reportingCurrencySymbol}) -{" "}
                {reportingCurrencyName} {"  "}
              </span>
              <span>
                <FontAwesomeIcon
                  icon={faQuestionCircle}
                  className="finsettings-item__header-icon"
                />
              </span>
            </p>
            <p className="finsettings-item__desc">
              This is the base currency for your organisation and cannot be
              changed.
            </p>
          </div>

          <div className="finsettings-container__2 finsettings-item">
            <p className="finsettings-item__header">
              Financial Year End
              <span>
                <FontAwesomeIcon
                  icon={faQuestionCircle}
                  className="finsettings-item__header-icon"
                />
              </span>
            </p>
            <p className="finsettings-item__desc">
              The specific date each year when your company sums its financial
              activities to see how you performed that year.
            </p>
            <div className="finsettings-ye">
              <Menu
                as="div"
                className="finsettings-ye__container finsettings-ye__container--month"
              >
                <MenuButton className="finsettings-yebutton finsettings-yemonth">
                  {selectedMonth}
                  <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
                </MenuButton>
                <MenuItems className="finsettings-yeitems">
                  {months.map((month) => (
                    <MenuItem key={month}>
                      {({ active }) => (
                        <a
                          href="#"
                          className={`finsettings-yeitem ${
                            active
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-700"
                          }`}
                          onClick={() => handleMonthChange(month)}
                        >
                          {month}
                        </a>
                      )}
                    </MenuItem>
                  ))}
                </MenuItems>
              </Menu>

              <Menu as="div" className="finsettings-ye">
                <MenuButton className="finsettings-yebutton finsettings-yeday">
                  {selectedDay}
                  <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
                </MenuButton>
                <MenuItems className="finsettings-yeitems finsettings-yeitems__day">
                  {daysInMonth.map((day) => (
                    <MenuItem key={day}>
                      {({ active }) => (
                        <a
                          href="#"
                          className={`finsettings-menuitem ${
                            active
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-700"
                          }`}
                          onClick={() => handleDayChange(day.toString())}
                        >
                          {day}
                        </a>
                      )}
                    </MenuItem>
                  ))}
                </MenuItems>
              </Menu>
            </div>
          </div>

          <div className="finsettings-container__3 finsettings-item">
            <p className="finsettings-item__header">
              Lock Date
              <span>
                <FontAwesomeIcon
                  icon={faQuestionCircle}
                  className="finsettings-item__header-icon"
                />
              </span>
            </p>
            <p className="finsettings-item__desc">
              Prevents changes to transactions on and before this date. You can
              change this at any time.
            </p>
            <div className="finsettings-item__cal">
              <input
                type="date"
                value={lockDate}
                onChange={(e) => setLockDate(e.target.value)}
                className="finsettings-dateinput"
              />
            </div>
          </div>

          <div className="finsettings-buttons">
            {/* Add save and cancel buttons here later if needed */}
          </div>
        </div>
      </div>
    </div>
  );
}
