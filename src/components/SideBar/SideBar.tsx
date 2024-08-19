import { Children, ElementType, ReactNode, useState } from "react";
import "./SideBar.scss";
import {
  Briefcase,
  Calculator,
  ChartPie,
  House,
  LogOut,
  Scale,
} from "lucide-react";
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
import { Link } from "react-router-dom";

export default function SideBar() {
  const { sideBarType } = useSideBarContext();
  const [isAdmin, setIsAdmin] = useState(true);

  return (
    <div className="sidebar">
      <aside
        className={`sidebar-container ${
          sideBarType === "small"
            ? "sidebar-container__sm sidebar-container__sm-open"
            : "sidebar-container__sm sidebar-container__sm-close"
        }`}
      >
        <div className="sidebar-top">
          <SmallSideBarItem isActive Icon={House} title="Home" url="/" />
          <SmallSideBarItem
            Icon={Calculator}
            title="Accounting"
            url="/accounting"
          />
          {isAdmin && (
            <SmallSideBarItem
              Icon={Briefcase}
              title="Workspace
            "
              url="/accounting/workspace"
            />
          )}
          <SmallSideBarItem Icon={Scale} title="Tax" url="/tax" />
          <SmallSideBarItem Icon={ChartPie} title="Reports" url="/reports" />
          <SmallSideBarItem icon={faComment} title="Messages" url="/messages" />
        </div>
        <div className="sidebar-bottom">
          <SmallSideBarItem Icon={LogOut} title="Log out" url="/logout" />
          <hr />
          <SmallSideBarItem icon={faUser} title="FirstName" url="/profile" />
        </div>
      </aside>
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
            <LargeSideBarItem
              Icon={Calculator}
              title="Accounting"
              url="/accounting"
            />
            {isAdmin && (
              <LargeSideBarItem
                Icon={Briefcase}
                title="Workspace"
                url="/accounting/workspace"
              />
            )}
            <LargeSideBarItem Icon={Scale} title="Tax" url="/tax" />
            <LargeSideBarItem Icon={ChartPie} title="Reports" url="/reports" />
            <LargeSideBarItem
              icon={faComment}
              title="Messages"
              url="/messages"
            />
          </LargeSideBarSection>
        </div>
        <div className="sidebar-bottom">
          <LargeSideBarSection>
            <LargeSideBarItem Icon={LogOut} title="Log out" url="/logout" />
            <hr />
            <LargeSideBarItem icon={faUser} title="FirstName" url="/profile" />
          </LargeSideBarSection>
        </div>
      </aside>
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
    <Link
      to={url}
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
    </Link>
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
    <Link
      to={url}
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
    </Link>
  );
}
