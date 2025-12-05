import './MultiSelectDropdown.scss';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  GroupableOption,
  MultiSelectOption,
  MultiSelectProps,
} from '../../shared/types/core';

export default function MultiSelectDropdown({
  options,
  selectedValues = [],
  placeholder = 'Select options...',
  onChange,
  className = '',
  disabled = false,
  searchable = true,
  maxDisplayItems = 3,
  maxHeight = '15rem',
  selectAllLabel = 'Select all',
  deselectAllLabel = 'Deselect all',
  clearLabel = 'Clear',
  noOptionsMessage = 'No options found',
  searchPlaceholder = 'Search...',
  renderOption,
  renderSelectedItem,
  loading = false,
  error,
  id,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const flattenOptions = (options: GroupableOption[]): MultiSelectOption[] => {
    return options.flatMap((item) => ('options' in item ? item.options : item));
  };

  const enabledOptions = flattenOptions(options).filter(
    (option) => !option.disabled,
  );

  const filterOptions = (options: GroupableOption[]): GroupableOption[] => {
    return options
      .map((item) => {
        if ('options' in item) {
          const filtered = item.options.filter(
            (opt) =>
              !opt.disabled &&
              opt.label.toLowerCase().includes(searchValue.toLowerCase()),
          );
          return filtered.length > 0 ? { ...item, options: filtered } : null;
        } else {
          return !item.disabled &&
            item.label.toLowerCase().includes(searchValue.toLowerCase())
            ? item
            : null;
        }
      })
      .filter(Boolean) as GroupableOption[];
  };

  // Filter options based on search input and disabled state
  //   const filteredOptions = searchValue
  //     ? options.filter(
  //         (option) =>
  //           option.label.toLowerCase().includes(searchValue.toLowerCase()) &&
  // ///           !option.disabled
  //       )
  //     : options.filter((option) => !option.disabled);

  const filteredOptions: GroupableOption[] = searchValue
    ? filterOptions(options)
    : options;

  // Enable options are options that are not disabled

  // Handle toggle dropdown
  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setSearchValue('');
      }
    }
  };

  // Handle item selection
  const handleItemClick = (value: string, optionDisabled?: boolean) => {
    if (optionDisabled) return;

    const newSelectedValues = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];

    onChange(newSelectedValues);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedValues.length === enabledOptions.length) {
      onChange([]);
    } else {
      onChange(enabledOptions.map((option) => option.value));
    }
  };

  // Handle clear all selections
  const handleClearSelections = () => {
    onChange([]);
    setSearchValue('');
  };

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Get selected items display text
  const getDisplayText = () => {
    if (selectedValues.length === 0) return placeholder;

    if (selectedValues.length <= maxDisplayItems) {
      return selectedValues
        .map(
          (value) =>
            flattenOptions(options).find((option) => option.value === value)
              ?.label,
        )
        .join(', ');
    }

    return `${selectedValues.length} items selected`;
  };

  // Custom rendering for selected items in the dropdown trigger
  const renderSelected = () => {
    if (selectedValues.length === 0) return placeholder;

    if (renderSelectedItem && selectedValues.length <= maxDisplayItems) {
      return (
        <div className="msd-rsi">
          {selectedValues.map((value) => {
            const option = flattenOptions(options).find(
              (option) => option.value === value,
            );
            if (!option) return null;
            return <div key={option.value}>{renderSelectedItem(option)}</div>;
          })}
        </div>
      );
    }

    return getDisplayText();
  };

  return (
    <div className={`msd ${className}`} ref={dropdownRef} id={id}>
      {/* Error message */}
      {error && <p className="msd-error">{error}</p>}

      {/* Dropdown trigger button */}
      <div
        className={`msd-trigger ${disabled ? 'msd-trigger-disabled' : ''} ${
          isOpen ? 'msd-trigger-open' : ''
        } ${error ? 'msd-trigger-error' : ''}`}
        onClick={toggleDropdown}
        tabIndex={disabled ? -1 : 0}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        role="combobox"
        aria-invalid={!!error}
      >
        <div
          className={`msd-trigger-wrap ${
            renderSelected() === placeholder ? 'msd-trigger-wrap__pl' : ''
          }`}
        >
          {renderSelected()}
        </div>
        <div className="msd-trigger-icon">
          {selectedValues.length > 0 && (
            <button
              type="button"
              className="msd-trigger-icon__btn"
              onClick={(e) => {
                e.stopPropagation();
                handleClearSelections();
              }}
              aria-label="Clear selections"
            >
              <X size={16} />
            </button>
          )}

          <button className="msd-trigger-icon__btn msd-trigger-icon__btn2">
            <ChevronDown
              className={`msd-trigger-icon__chevron ${
                isOpen ? 'msd-trigger-icon__chevron-open' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="msd-menu">
          {/* Search input */}
          {searchable && (
            <div className="msd-menu-search">
              <Search size={14} className="msd-menu-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="msd-menu-search__input"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Select all / Clear all button */}
          <div className="msd-menu-sall">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectAll();
              }}
              className="msd-menu-sall__btn"
              disabled={loading}
            >
              {selectedValues.length === enabledOptions.length
                ? deselectAllLabel
                : selectAllLabel}
            </button>
            {selectedValues.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearSelections();
                }}
                className="msd-menu-sall__btn"
                disabled={loading}
              >
                {clearLabel} ({selectedValues.length})
              </button>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="msd-menu-loading">
              <div className="msd-menu-loading__x"></div>
            </div>
          )}

          {/* Options list */}
          <div
            className="msd-menu-list"
            style={{ maxHeight }}
            role="listbox"
            aria-multiselectable="true"
          >
            {!loading && filteredOptions.length > 0 ? (
              filteredOptions.map((item) => {
                if ('options' in item) {
                  return (
                    <div key={item.label} className="msd-menu-group">
                      <div className="msd-menu-group__label">{item.label}</div>
                      {item.options.map((option) => {
                        const isSelected = selectedValues.includes(
                          option.value,
                        );

                        return (
                          <div
                            key={option.value}
                            className={`msd-menu-list__item
                        ${isSelected ? 'msd-menu-list__item--selected' : ''}
                        ${option.disabled ? 'msd-menu-list__item--disabled' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleItemClick(option.value, option.disabled);
                            }}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={0}
                            aria-disabled={option.disabled}
                          >
                            {renderOption ? (
                              renderOption(option, isSelected)
                            ) : (
                              <>
                                <div
                                  className={`msd-menu-option
                              ${isSelected ? 'msd-option-selected' : ''}
                            `}
                                >
                                  {isSelected && (
                                    <Check
                                      size={14}
                                      className="msd-option-icon"
                                    />
                                  )}
                                </div>
                                <span>{option.label}</span>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                } else {
                  const isSelected = selectedValues.includes(item.value);
                  return (
                    <div
                      key={item.value}
                      className={`msd-menu-list__item
                      ${isSelected ? 'msd-menu-list__item--selected' : ''}
                      ${item.disabled ? 'msd-menu-list__item--disabled' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(item.value, item.disabled);
                      }}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                      aria-disabled={item.disabled}
                    >
                      {renderOption ? (
                        renderOption(item, isSelected)
                      ) : (
                        <>
                          <div
                            className={`msd-menu-option
                            ${isSelected ? 'msd-option-selected' : ''}
                          `}
                          >
                            {isSelected && (
                              <Check size={14} className="msd-option-icon" />
                            )}
                          </div>
                          <span>{item.label}</span>
                        </>
                      )}
                    </div>
                  );
                }
              })
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                {noOptionsMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
