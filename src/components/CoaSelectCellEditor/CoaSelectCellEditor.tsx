import { useEffect, useRef, useState } from "react";
import "./CoaSelectCellEditor.scss";
import { ChevronDown, ChevronUp } from "lucide-react";

interface SelectProps {
  options: any[];
  onChange?: (option: any) => void;
  value?: any;
  placeholder?: string;
  className?: string;
}

export default function CustomSelect({
  options,
  onChange,
  value,
  placeholder = "Select Account",
  className = "",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typedText, setTypedText] = useState("");

  const selectRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((option) =>
    option.accountName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const handleSelect = (option: any) => {
    setSearchTerm("");
    onChange?.(option);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
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
      const startIndex = hoveredIndex ?? prev;
      const nextIndex = startIndex + direction;
      const clampedIndex = Math.max(0, Math.min(options.length - 1, nextIndex));

      dropdownRef.current
        ?.querySelectorAll(".selectcoa__option")
        [clampedIndex]?.scrollIntoView({
          block: "nearest",
        });

      setHoveredIndex(null);

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
        if (isOpen) handleSelect(options[highlightedIndex]);
        else setIsOpen(true);
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

  useEffect(() => {
    document.body.addEventListener("click", handleOutsideClick);
    return () => {
      document.body.removeEventListener("click", handleOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setHoveredIndex(null);
    }
  }, [isOpen]);

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
        />
        <div className="selectcoa__icon">
          {isOpen ? <ChevronUp /> : <ChevronDown />}
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
                  {option.accountCode
                    ? `${option.accountCode} - ${option.accountName}`
                    : option.accountName}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
