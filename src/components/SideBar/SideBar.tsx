import { Children, ElementType, ReactNode, useState } from "react";
import "./SideBar.scss";
import { Calculator, ChartPie, House, LogOut, Scale } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import Button from "../Button/Button";
import {
  faChevronDown,
  faChevronUp,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { useSideBarContext } from "../../contexts/SideBarContext";

export default function SideBar() {
  const { sideBarType } = useSideBarContext();

  return (
    <div className="sidebar">
      {/* {sideBarType === "small" ? ( */}
        <aside
          className={`sidebar-container ${
            sideBarType === "small"
              ? "sidebar-container__sm sidebar-container__sm-open"
              : "sidebar-container__sm sidebar-container__sm-close"
          }`}
        >
          <div className="sidebar-top">
            <SmallSideBarItem isActive Icon={House} title="Home" url="/" />
            <SmallSideBarItem Icon={Calculator} title="Accounting" url="/" />
            <SmallSideBarItem Icon={Scale} title="Tax" url="/" />
            <SmallSideBarItem Icon={ChartPie} title="Reports" url="/" />
            <SmallSideBarItem icon={faComment} title="Messages" url="/" />
          </div>
          <div className="sidebar-bottom">
            <SmallSideBarItem Icon={LogOut} title="Log out" url="/" />
            <hr />
            <SmallSideBarItem icon={faUser} title="FirstName" url="/" />
          </div>
        </aside>
      {/* ) : ( */}
        <aside
          className={`sidebar-container ${
            sideBarType === "large"
              ? "sidebar-container__lg sidebar-container__lg-open"
              : "sidebar-container__lg sidebar-container__lg-close"
          }`}
        >
          <div className="sidebar-top">
            <LargeSideBarSection>
              <LargeSideBarItem isActive Icon={House} title="Home" url="/" />
              <LargeSideBarItem Icon={Calculator} title="Accounting" url="/" />
              <LargeSideBarItem Icon={Scale} title="Tax" url="/" />
              <LargeSideBarItem Icon={ChartPie} title="Reports" url="/" />
              <LargeSideBarItem icon={faComment} title="Messages" url="/" />
            </LargeSideBarSection>
          </div>
          <div className="sidebar-bottom">
            <LargeSideBarSection>
              <LargeSideBarItem Icon={LogOut} title="Log out" url="/" />
              <hr />
              <LargeSideBarItem icon={faUser} title="FirstName" url="/" />
            </LargeSideBarSection>
          </div>
        </aside>
      {/* )} */}
    </div>
  );
}

type SmallSideBarItemProps = {
  Icon?: ElementType;
  icon?: IconDefinition | string | JSX.Element;
  title: string;
  url: string;
  isActive?: boolean;
};

function SmallSideBarItem({
  Icon,
  icon,
  title,
  url,
  isActive = false,
}: SmallSideBarItemProps) {
  return (
    <a
      href={url}
      className={`sidebar-item sidebar-item__sm ${
        isActive ? "sidebar-item__active" : undefined
      }`}
    >
      {Icon && <Icon className="sidebar-icon" />}
      {icon &&
        (typeof icon === "string" ? (
          <img src={icon} alt={title} className="sidebar-icon" />
        ) : (
          <FontAwesomeIcon
            icon={icon as IconDefinition}
            className="sidebar-icon"
          />
        ))}
      <div className="sidebar-text">{title}</div>
    </a>
  );
}

type LargeSideBarSectionProps = {
  children: ReactNode;
  title?: string;
  visibleItemCount?: number;
};

function LargeSideBarSection({
  children,
  title,
  visibleItemCount = Number.POSITIVE_INFINITY,
}: LargeSideBarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const childrenArray = Children.toArray(children).flat();
  const showExpandButton = childrenArray.length > visibleItemCount;
  const visibleChildren = isExpanded
    ? childrenArray
    : childrenArray.slice(0, visibleItemCount);

  return (
    <>
      {title && <div className="sidebar-title">{title}</div>}
      {visibleChildren}
      {showExpandButton && (
        <Button
          icon={isExpanded ? faChevronUp : faChevronDown}
          customClass="sidebar-icon__expand"
          text={isExpanded ? "Show Less" : "Show More"}
          onClick={() => setIsExpanded((e) => !e)}
        />
      )}
    </>
  );
}

type LargeSideBarItemProps = {
  Icon?: ElementType;
  icon?: IconDefinition | string | JSX.Element;
  title: string;
  url: string;
  isActive?: boolean;
};
function LargeSideBarItem({
  Icon,
  icon,
  title,
  url,
  isActive = false,
}: LargeSideBarItemProps) {
  return (
    <a
      href={url}
      className={`sidebar-item sidebar-item__lg ${
        isActive ? "sidebar-item__active" : undefined
      }`}
    >
      {Icon && <Icon className="sidebar-icon" />}
      {icon &&
        (typeof icon === "string" ? (
          <img src={icon} alt={title} className="sidebar-icon" />
        ) : (
          <FontAwesomeIcon
            icon={icon as IconDefinition}
            className="sidebar-icon"
          />
        ))}
      <div className="sidebar-text">{title}</div>
    </a>
  );
}
