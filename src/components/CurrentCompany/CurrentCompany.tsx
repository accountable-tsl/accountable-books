import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./CurrentCompany.scss";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

type CurrentCompanyProps = {
  currentCompany?: string;
};

export default function CurrentCompany({
  currentCompany,
}: CurrentCompanyProps) {
  return (
    <div className="cc">
      <div className="cc-container">
        <div className="cc-text">
          You are signed into{" "}
          <strong className="cc-text__company">
            {currentCompany || "Demo Company"}
          </strong>
        </div>
        <div className="cc-switch">
          switch{" "}
          <FontAwesomeIcon icon={faChevronDown} className="cc-switch__icon" />
        </div>
      </div>
    </div>
  );
}
