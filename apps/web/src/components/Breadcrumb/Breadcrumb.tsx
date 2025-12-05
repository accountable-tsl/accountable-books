import './Breadcrumb.scss';

import {
  faChevronDown,
  faChevronRight,
  IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

type BreadcrumbItem = {
  text: string;
  icon?: any;
  link?: string;
  hasDropdown?: boolean;
  dropdownItems?: { text: string; link?: string }[];
};

type BreadcrumbProps = { items: BreadcrumbItem[] };

export default function Breadcrumb({
  items,
  customClass,
}: BreadcrumbProps & { customClass?: string }) {
  if (!items || items.length === 0) return null;

  return (
    <div className={`breadcrumb ${customClass || ''}`}>
      {items.map((item, index) => (
        <BreadcrumbItemComponent
          key={index}
          item={item}
          isLastItem={index === items.length - 1}
        />
      ))}
    </div>
  );
}

function BreadcrumbItemComponent({
  item,
  isLastItem,
}: {
  item: BreadcrumbItem;
  isLastItem: boolean;
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div
      className={`breadcrumb-item ${isLastItem ? 'breadcrumb-item__last' : ''}`}
    >
      {!isLastItem ? (
        <Link to={item.link || '#'} className="breadcrumb-item__link">
          {item.icon ? (
            typeof item.icon === 'object' && 'iconName' in item.icon ? (
              <FontAwesomeIcon
                icon={item.icon as IconDefinition}
                className="breadcrumb-item__icon"
              />
            ) : (
              <item.icon className="breadcrumb-item__icon" />
            )
          ) : null}

          <span className="breadcrumb-item__text">
            {item.text || 'Unnamed'}
          </span>
        </Link>
      ) : (
        <Link
          to={item.link || '#'}
          className="breadcrumb-item__link breadcrumb-item__link--last"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          {item.icon ? (
            typeof item.icon === 'object' && 'iconName' in item.icon ? (
              <FontAwesomeIcon
                icon={item.icon as IconDefinition}
                className="breadcrumb-item__icon"
              />
            ) : (
              <item.icon className="breadcrumb-item__icon" />
            )
          ) : null}

          {/* {item.icon ? (
            typeof item.icon === "string" ? (
              <i
                className={`fa-kit ${item.icon}`}
              ></i>
            ) : typeof item.icon === "object" &&
              "iconName" in item.icon ? (
              <FontAwesomeIcon
                icon={item.icon as IconDefinition}
                className="breadcrumb-item__icon"
              />
            ) : (
              <item.icon className="breadcrumb-item__icon" />
            )
          ) : null} */}

          <span className="breadcrumb-item__text">
            {item.text || 'Unnamed'}
          </span>
          {item.hasDropdown && (
            <FontAwesomeIcon
              icon={faChevronDown}
              className="breadcrumb-item__dropdown-icon"
            />
          )}
        </Link>
      )}

      {!isLastItem && (
        <div className="breadcrumb-item__chevron">
          <FontAwesomeIcon icon={faChevronRight} />
        </div>
      )}

      {isLastItem && item.hasDropdown && item.dropdownItems && (
        <div ref={dropdownRef} className="breadcrumb-item__dropdown">
          <div className="breadcrumb-item__dropdown-content">
            {isDropdownOpen
              ? item.dropdownItems.map((dropdownItem, i) => (
                  <Link
                    key={i}
                    to={dropdownItem.link || '#'}
                    className="breadcrumb-item__dropdown-link"
                  >
                    {dropdownItem.text || 'Unnamed Option'}
                  </Link>
                ))
              : null}
          </div>
        </div>
      )}
    </div>
  );
}
