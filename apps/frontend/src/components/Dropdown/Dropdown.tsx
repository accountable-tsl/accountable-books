import { useEffect, useRef, useState } from "react";
import "./Dropdown.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";

type Option = {
  value: string;
  label: string;
};

type DropdownProps = {
  options: Option[];
  defaultLabel: string;
  onOptionSelected?: (option: Option) => void;
};

export default function Dropdown({
  options,
  defaultLabel,
  onOptionSelected,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [selectedOption, setSelectedOption] = useState({
    value: "",
    label: defaultLabel,
  });

  const handleOptionClick = (option: Option) => {
    setSelectedOption(option);
    setIsOpen(false);
    if (onOptionSelected) {
      onOptionSelected(option);
    }
  };

  const dropdownRef = useRef(null);

  const handleOutsideClick = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !event.composedPath().includes(dropdownRef.current)
    ) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.body.addEventListener("click", handleOutsideClick);
    return () => {
      document.body.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  return (
    <div
      className={`pfa dropdown-wrapper ${
        isOpen ? "dropdown-wrapper__open" : ""
      }`}
      ref={dropdownRef}
    >
      <div
        className={`dropdown-select ${isOpen ? "dropdown-select__open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedOption.label}
        <FontAwesomeIcon icon={faCaretDown} className="dropdown-select__icon" />
      </div>

      {isOpen && (
        <div
          className={`dropdown-options ${
            isOpen ? "dropdown-options--open" : ""
          }`}
        >
          {options.map((option) => (
            <div
              className="dropdown-option"
              key={option.value}
              onClick={() => handleOptionClick(option)}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
