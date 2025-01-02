import { useEffect, useRef, useState } from "react";

export default function CoaSelectCellEditor(props: any) {
  const [value, setValue] = useState(props.value || "");
  const [options, setOptions] = useState([]);

  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (selectRef.current) {
      selectRef.current.focus();
    }

    setOptions(Array.isArray(props.options) ? props.options : []);
  }, [props.options]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(event.target.value);
  };

  const handleBlur = () => {
    props.stopEditing(value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSelectElement>) => {
    if (event.key === "Enter") {
      props.stopEditing(value);
    }
  };

  return (
    // <select
    //   ref={selectRef}
    //   value={value}
    //   onChange={handleChange}
    //   onBlur={handleBlur}
    //   onKeyDown={handleKeyDown}
    //   className="w-full"
    // >
    //   <option value="" disabled>
    //     Select Account
    //   </option>
    //   {options.map((option: any) => (
    //     <option key={option.id} value={option.id}>
    //       {option.accountCode
    //         ? `${option.accountCode} - ${option.accountName}`
    //         : option.accountName}
    //     </option>
    //   ))}
    // </select>

    <div className="selectcoa">
      <div className="selectcoa__top">
        <div className="selectcoa__selected"></div>
        <div className="selectcoa__icon"></div>
      </div>
      <div className="selectcoa__bottom">
        {options.map((option: any) => (
          <div key={option.id} className="selectcoa__option">
            {option.accountCode
              ? `${option.accountCode} - ${option.accountName}`
              : option.accountName}
          </div>
        ))}
      </div>
    </div>
  );
}
