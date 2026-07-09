import './DatePlaceholderInput.scss';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Placeholder {
  label: string;
  value: string;
}

interface DatePlaceholderInputProps {
  onInsert: (value: string) => void;
  className?: string;
}

export default function DatePlaceholderInput({
  onInsert,
  className,
}: DatePlaceholderInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const placeholders: Placeholder[] = [
    { label: 'Day', value: '[Day]' },
    { label: 'Week', value: '[Week]' },
    { label: 'Month', value: '[Month]' },
    { label: 'Year', value: '[Year]' },
    { label: 'Week Year', value: '[Week Year]' },
    { label: 'Month Year', value: '[Month Year]' },
  ];

  const handleSelect = (value: string) => {
    onInsert(value);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleOutsideClick = (e: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className={`date-ph-dropdown ${className || ''}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="date-ph-dropdown__trigger"
      >
        Insert Placeholder
      </button>

      {isOpen && (
        <div className="date-ph-dropdown__list" role="listbox">
          {placeholders.map((ph) => (
            <div
              key={ph.value}
              role="option"
              tabIndex={0}
              onClick={() => handleSelect(ph.value)}
              className="date-ph-dropdown__item"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleSelect(ph.value);
                }
              }}
            >
              {ph.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface UsePlaceholderInput {
  value: string;
  setValue: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

export const usePlaceholderInput = ({
  value,
  setValue,
  inputRef,
}: UsePlaceholderInput) => {
  const insertPlaceholderAtCursor = useCallback(
    (placeholder: string) => {
      const input = inputRef.current;
      if (!input) return;

      const startPosition = input.selectionStart ?? 0;
      const endPosition = input.selectionEnd ?? 0;
      const before = value.substring(0, startPosition);
      const after = value.substring(endPosition);

      const newText = before + placeholder + after;
      setValue(newText);

      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(
          startPosition + placeholder.length,
          startPosition + placeholder.length,
        );
      });
    },
    [value, setValue, inputRef],
  );

  return { insertPlaceholderAtCursor };
};

export function validatePlaceholder(input: string): boolean {
  const placeholderCandidates = input.match(/\[.*?\]/g) || [];

  const validPlaceholderRegex =
    /^\[(Day|Week|Month|Year|Week Year|Month Year)([+-]\d+)?\]$/;

  for (const candidate of placeholderCandidates) {
    if (!validPlaceholderRegex.test(candidate)) {
      console.warn(`Invalid placeholder detected: ${candidate}`);
      return false;
    }
  }
  return true;
}
