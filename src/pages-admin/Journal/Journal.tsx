import "./Journal.scss";
import { NotepadText, TableProperties } from "lucide-react";
import Breadcrumb from "../../components/Breadcrumb/Breadcrumb";
import { routes, staticRoutes } from "../../utils/routes";
import { useCompany } from "../../utils/company";
import JournalList from "../../components/JournalList/JournalList";
import JournalForm from "../../components/JournalForm/JournalForm";
import { matchPath, useLocation } from "react-router-dom";
import { BeatLoader } from "react-spinners";
import { useEffect, useMemo } from "react";
import { JournalStatus, ScreenSize } from "../../types/types";
import FallbackView from "../../components/FallbackView/FallbackView";
import { useScreenSize } from "../../utils/utils";
import JournalView from "../../components/JournalView/JournalView";

export default function Journal() {
  const { companyId, company } = useCompany();
  const screenSize = useScreenSize();

  const location = useLocation();

  const isDefault = matchPath(
    { path: staticRoutes.accounting.workspace.journal, end: true },
    location.pathname
  );

  const isAddNewJournal = matchPath(
    staticRoutes.accounting.workspace.newJournal,
    location.pathname
  );

  const isAddNewRecurringJournal = matchPath(
    staticRoutes.accounting.workspace.newRecurringJournal,
    location.pathname
  );

  const isViewJournal =
    !(isAddNewJournal || isAddNewRecurringJournal) &&
    matchPath(staticRoutes.accounting.workspace.viewJournal, location.pathname);

  const showJournalList = !!isDefault;
  const showNewJournalForm = !!isAddNewJournal;
  const showNewRecurringJournalForm = !!isAddNewRecurringJournal;
  const showViewJournal = !!isViewJournal;

  const isLoading = !companyId || !company;

  //   const journalBreadcrumbs = [
  //     {
  //       text: "Accounting",
  //       icon: TableProperties,
  //       link: routes.accounting.root(companyId),
  //     },
  //     {
  //       text: "Journal",
  //       icon: NotepadText,
  //       link: routes.accounting.workspace.journal(companyId),
  //       hasDropdown: false,
  //     },
  //     ...(showNewJournalForm || showNewRecurringJournalForm
  //       ? [
  //           {
  //             text: showNewJournalForm ? "New Journal" : "New Recurring Journal",
  //             link: companyId
  //               ? showNewJournalForm
  //                 ? routes.accounting.workspace.newJournal(companyId)
  //                 : routes.accounting.workspace.newRecurringJournal(companyId)
  //               : "#",
  //             hasDropdown: false,
  //           },
  //         ]
  //       : []),
  //   ];

  const journalBreadcrumbs = useMemo(
    () => [
      {
        text: "Accounting",
        icon: TableProperties,
        link: companyId ? routes.accounting.root(companyId) : "#",
      },
      {
        text: "Journal",
        icon: NotepadText,
        link: companyId ? routes.accounting.workspace.journal(companyId) : "#",
        hasDropdown: false,
      },
      ...(showNewJournalForm || showNewRecurringJournalForm
        ? [
            {
              text: showNewJournalForm
                ? "New Journal"
                : "New Recurring Journal",
              link: companyId
                ? showNewJournalForm
                  ? routes.accounting.workspace.newJournal(companyId)
                  : routes.accounting.workspace.newRecurringJournal(companyId)
                : "#",
              hasDropdown: false,
            },
          ]
        : []),
    ],
    [
      companyId,
      showNewJournalForm,
      showNewRecurringJournalForm,
      showViewJournal,
    ]
  );

  const fbvType =
    !companyId || !company
      ? "unauthorized"
      : screenSize !== ScreenSize.Desktop
      ? "screenSize"
      : "default";

  useEffect(() => {}, [location.pathname]);

  return (
    <>
      <FallbackView customClass="journal-fbv-main" type={fbvType} />

      <div className="journal">
        <Breadcrumb items={journalBreadcrumbs} />

        {isLoading ? (
          <div className="journal-loading">
            <BeatLoader />
          </div>
        ) : (
          <div className="journal-content">
            {showJournalList && (
              <JournalList
                key={`journal-list-${location.pathname}`}
                companyId={companyId}
                company={company}
                data={null}
              />
            )}

            {showNewJournalForm && (
              <JournalForm
                key="new-journal"
                journalStatus={JournalStatus.DRAFT}
                companyId={companyId}
                company={company}
              />
            )}

            {showNewRecurringJournalForm && (
              <JournalForm
                key="new-recurring-journal"
                type="recurring"
                journalStatus={JournalStatus.DRAFT}
                companyId={companyId}
                company={company}
              />
            )}

            {showViewJournal && (
              <JournalView
                key={`journal-view-${location.pathname}`}
                companyId={companyId}
                company={company}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
