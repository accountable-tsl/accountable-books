import "./TabNavigation.scss";
import { Link } from "react-router-dom";
import { TabNavigationProps } from "../../types/types";

const TabNavigation = <T extends string>({
  tabs,
  activeTab,
  onTabChange,
  baseClassName = "coa-tab",
}: TabNavigationProps<T>) => {
  return (
    <div className={baseClassName}>
      {tabs.map((tab, index) => {
        const isFirst = index === 0;
        const isLast = index === tabs.length - 1;
        return (
          <Link
            key={index}
            to={tab.link}
            className={`${baseClassName}__item ${
              tab.className ? tab.className : ""
            } ${isFirst ? `${baseClassName}__first` : ""} ${
              isLast ? `${baseClassName}__last` : ""
            } ${activeTab === tab.key ? `${baseClassName}__active` : ""}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
};

export default TabNavigation;
