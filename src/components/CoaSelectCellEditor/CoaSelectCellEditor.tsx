import { useEffect, useRef, useState } from "react";
import "./CoaSelectCellEditor.scss";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { set } from "date-fns";

interface SelectProps {
  options: any[];
  keysToDisplay?: string[]; //subject to a maximum of 2
  onChange?: (option: any) => void;
  value?: any;
  placeholder?: string;
  className?: string;
}

export default function CustomSelect({
  options,
  keysToDisplay = ["accountCode", "accountName"],
  onChange,
  value,
  placeholder = "Select Account",
  className = "",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState(""); //To filter visible options via input box
  const [typedText, setTypedText] = useState(""); //For quick navigation, allow to jump to matching option based on first few letters.
  const [inputValue, setInputValue] = useState(value?.accountName || "");
  const [isTyping, setIsTyping] = useState(false);

  const selectRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = isTyping
    ? options.filter((option) => {
        const lowerSearch = inputValue.toLowerCase();
        return (
          (option[keysToDisplay[1]] &&
            option[keysToDisplay[1]].toLowerCase().includes(lowerSearch)) ||
          (option[keysToDisplay[0]] &&
            option[keysToDisplay[0]].toLowerCase().includes(lowerSearch))
        );
      })
    : options;

  const handleSelect = (option: any) => {
    // setSearchTerm("");
    setIsTyping(false);
    setInputValue(option[keysToDisplay[1]] ?? option[keysToDisplay[0]]);
    onChange?.(option);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // setSearchTerm(e.target.value);
    setInputValue(e.target.value);
    setIsTyping(true);
    setIsOpen(true);
  };

  const handleOutsideClick = (event: MouseEvent) => {
    if (
      selectRef.current &&
      !event.composedPath().includes(selectRef.current)
    ) {
      setIsOpen(false);
    }
  };

  const navigateOptions = (direction: number) => {
    setHighlightedIndex((prev) => {
      // const startIndex = hoveredIndex ?? prev;
      const nextIndex = prev + direction;
      const clampedIndex = Math.max(
        0,
        Math.min(filteredOptions.length - 1, nextIndex)
      );

      dropdownRef.current
        ?.querySelectorAll(".selectcoa__option")
        [clampedIndex]?.scrollIntoView({
          block: "nearest",
        });

      // setHoveredIndex(null);

      return clampedIndex;
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;

    if (isOpen && key.length === 1 && key.match(/[a-zA-Z0-9]/)) {
      handleTyping(key);
    }

    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        setIsOpen(true);
        navigateOptions(1);
        break;

      case "ArrowUp":
        event.preventDefault();
        setIsOpen(true);
        navigateOptions(-1);
        break;

      case "Enter":
        event.preventDefault();
        // if (isOpen) handleSelect(options[highlightedIndex]);
        // else setIsOpen(true);
        if (!isOpen) {
          setIsOpen(true);
        } else {
          // Only select if we actually have a highlighted item
          if (
            highlightedIndex >= 0 &&
            highlightedIndex < filteredOptions.length
          ) {
            handleSelect(filteredOptions[highlightedIndex]);
          }
        }
        break;

      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        break;

      default:
        break;
    }
  };

  const handleTyping = (key: string) => {
    setTypedText((prev) => prev + key);

    const matchingIndex = filteredOptions.findIndex((option) =>
      option.accountName.toLowerCase().startsWith(typedText.toLowerCase())
    );

    if (matchingIndex !== -1) {
      setHighlightedIndex(matchingIndex);
      dropdownRef.current
        ?.querySelectorAll(".selectcoa__option")
        [matchingIndex]?.scrollIntoView({
          block: "nearest",
        });
    }

    setTimeout(() => {
      setTypedText("");
    }, 1000);
  };

  const handleMouseEnter = (index: number) => {
    setHoveredIndex(index);
  };
  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  const toggleDropdown = () => {
    setIsOpen((prev) => {
      if (!prev && highlightedIndex >= 0) {
        dropdownRef.current
          ?.querySelectorAll(".selectcoa__option")
          [highlightedIndex]?.scrollIntoView({
            block: "nearest",
          });
      }
      return !prev;
    });
  };

  // const handleBlur = () => {
  //   if (!filteredOptions.some((opt) => opt.accountName === inputValue)) {
  //     setInputValue(value?.accountName || "");
  //   }
  //   setIsTyping(false);
  //   setInputValue(value?.accountName || "");
  //   setIsOpen(false);
  // };

  useEffect(() => {
    if (isOpen) {
      document.body.addEventListener("click", handleOutsideClick);
    }
    return () => {
      document.body.removeEventListener("click", handleOutsideClick);
    };
  }, [isOpen]);

  // useEffect(() => {
  //   if (!isOpen) {
  //     setHoveredIndex(null);
  //   }
  // }, [isOpen]);

  useEffect(() => {
    const timeout = setTimeout(() => setTypedText(""), 1000);
    return () => clearTimeout(timeout);
  }, [typedText]);

  return (
    <div
      className={`selectcoa ${className}`}
      ref={selectRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="selectcoa__select" onClick={toggleDropdown}>
        <input
          type="text"
          className="selectcoa__input"
          placeholder={placeholder}
          onChange={handleInputChange}
          onClick={(e) => e.stopPropagation()}
          // value={searchTerm || value?.accountName || ""}
          value={inputValue}
          // onBlur={handleBlur}
        />
        <div className="selectcoa__icon">
          {isOpen ? (
            <FontAwesomeIcon icon={faChevronUp} />
          ) : (
            <FontAwesomeIcon icon={faChevronDown} />
          )}
        </div>
      </div>

      {isOpen && (
        <div
          className={`selectcoa__dropdown ${
            isOpen ? "selectcoa__dropdown--open" : ""
          }`}
          ref={dropdownRef}
          role="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          {filteredOptions.length === 0 ? (
            <div className="selectcoa__no-results">No matching results</div>
          ) : (
            filteredOptions.map((option: any, index: number) => {
              const selectedOption = value?.id === option.id;
              const isHighlighted = highlightedIndex === index;
              return (
                <div
                  key={option.id}
                  role="option"
                  aria-selected={highlightedIndex === index}
                  className={`selectcoa__option ${
                    selectedOption ? "selectcoa__option--selected" : ""
                  } ${isHighlighted ? "selectcoa__option--highlighted" : ""}`}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => handleMouseEnter(index)}
                  onMouseLeave={handleMouseLeave}
                >
                  {option[keysToDisplay[0]]
                    ? `${option[keysToDisplay[0]]} - ${
                        option[keysToDisplay[1]]
                      }`
                    : option[keysToDisplay[1]]}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
