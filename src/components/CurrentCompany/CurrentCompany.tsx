import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./CurrentCompany.scss";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { useCompany } from "../../utils/company";
import { fetchCompany } from "../../services/CompanyServices";
import { useEffect, useState } from "react";
import { CompanyData } from "../../types/types";

export default function CurrentCompany() {
  const { companyId } = useCompany();

  const [companyDetails, setCompanyDetails] = useState<CompanyData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  const getCompanyDetails = async (companyId: string) => {
    setIsLoading(true);
    try {
      const response = await fetchCompany(companyId);
      if (response.success && response.data) {
        setCompanyDetails(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch company details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderCompanyName = () => {
    if (isLoading) return "Loading...";

    const name = companyDetails?.name || "A Company";
    const flag = companyDetails?.countryFlag || "";

    return flag ? `${name} ${flag}` : name;
  };

  useEffect(() => {
    if (!companyId) return;
    getCompanyDetails(companyId);
  }, [companyId]);

  return (
    <div className="cc">
      <div className="cc-container">
        <div className="cc-text">
          You are signed into{" "}
          <strong className="cc-text__company">{renderCompanyName()}</strong>
        </div>
        <div className="cc-switch">
          switch{" "}
          <FontAwesomeIcon icon={faChevronDown} className="cc-switch__icon" />
        </div>
      </div>
    </div>
  );
}
