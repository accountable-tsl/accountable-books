import "./AddBankAccount.scss";
import { usePopup } from "../../contexts/PopupContext";
import { fetchBank } from "../../services/BankServices";
import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { fetchCurrencies } from "../../services/currencyServices";
import { createBankAccount } from "../../services/BankAccountServices";
import { useCompany } from "../../utils/company";

type Errors = {
  bankId?: string;
  displayName?: string;
  bankAccountNo?: string;
  currencyId?: string;
};

export default function AddBankAccount() {
  const { companyId } = useCompany();
  const { closePopup } = usePopup();

  const [banks, setBanks] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [formData, setFormData] = useState({
    bankId: "",
    displayName: "",
    bankAccountType: "CHECKINGS_CURRENT",
    bankAccountNo: "",
    currencyId: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [onSubmitError, setOnSubmitError] = useState({});

  const handleFetchBank = async () => {
    const banks = await fetchBank();
    banks.success === true && setBanks(banks.data);
  };

  const handleFetchCurrencies = async () => {
    const currencies = await fetchCurrencies();
    currencies.success === true && setCurrencies(currencies.data);
  };

  useEffect(() => {
    handleFetchBank();
    handleFetchCurrencies();
  }, []);

  useEffect(() => {
    validateForm();
  }, [formData]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;

    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const validateForm = () => {
    const newErrors: Errors = {};

    if (!formData.bankId) newErrors.bankId = "Bank is required";
    if (!formData.displayName)
      newErrors.displayName = "Account Name is required";
    if (!formData.bankAccountNo)
      newErrors.bankAccountNo = "Account Number is required";
    if (!formData.currencyId) newErrors.currencyId = "Currency is required";

    setErrors(newErrors);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    console.log(formData);

    validateForm();

    if (Object.keys(errors).length === 0) {
      try {
        const response = await createBankAccount(companyId, formData);
        console.log(response);
        response.success && closePopup();
      } catch (error: any) {
        console.error("Error creating bank account", error);
        setOnSubmitError(error.response.data);
      }
    }
  };

  // console.log(banks, currencies);
  // console.log(formData);

  return (
    <div className="addbankaccount">
      <div className="addbankaccount-header">Add Bank Account</div>
      <form action="" className="addbankaccount-form">
        <div className="addbankaccount-form__item">
          <label className="addbankaccount-label">Bank *</label>
          <select
            name="bankId"
            id="bank-select"
            className="addbankaccount-input"
            value={formData.bankId}
            onChange={handleChange}
          >
            <option value="">Select Bank</option>
            {banks?.map((bank: any, index: number) => (
              <option key={bank.bankId || index} value={bank.bankId}>
                {bank.bankName}
              </option>
            ))}
          </select>
          <p className={`addbankaccount-form__error`}>
            <FontAwesomeIcon icon={faQuestionCircle} /> Bank is required
          </p>
        </div>
        <div className="addbankaccount-form__item">
          <label className="addbankaccount-label">Account Name *</label>
          <input
            type="text"
            name="displayName"
            className="addbankaccount-input"
            placeholder="GTB Salary Account **1088"
            value={formData.displayName}
            onChange={handleChange}
          />
          <p
            className={`addbankaccount-form__error ${
              errors.displayName ? "addbankaccount-form__error--visible" : ""
            }`}
          >
            <FontAwesomeIcon icon={faQuestionCircle} /> Bank Account Name is
            required
          </p>
        </div>
        <div className="addbankaccount-form__item">
          <label className="addbankaccount-label">Account Number *</label>
          <input
            type="text"
            className="addbankaccount-input"
            placeholder="0011223344"
            name="bankAccountNo"
            value={formData.bankAccountNo}
            onChange={handleChange}
          />
          <p
            className={`addbankaccount-form__error ${
              errors.bankAccountNo ? "addbankaccount-form__error--visible" : ""
            }`}
          >
            <FontAwesomeIcon icon={faQuestionCircle} /> Account Number is
            required
          </p>
        </div>
        <div className="addbankaccount-form__segment">
          <div className="addbankaccount-form__item">
            <label
              className="addbankaccount-label"
              htmlFor="bankaccount-type-select"
            >
              Account Type *
            </label>
            <select
              name="bankAccountType"
              id="bankaccount-type-select"
              className="addbankaccount-input"
              value={formData.bankAccountType}
              onChange={handleChange}
            >
              <option value="CHECKINGS_CURRENT">Checkings/Current</option>
              <option value="CREDIT_CARD">Credit Card</option>
              <option value="DEBIT_CARD">Debit Card</option>
              <option value="SAVINGS">Savings</option>
              <option value="UTILITY">Utility</option>
              <option value="OTHER">Other</option>
            </select>
            <p className={`addbankaccount-form__error`}>
              <FontAwesomeIcon icon={faQuestionCircle} /> Please select account
              type
            </p>
          </div>
          <div className="addbankaccount-form__item">
            <label
              className="addbankaccount-label"
              htmlFor="bankaccount-currency-select"
            >
              Bank Account Currency *
            </label>
            <select
              name="currencyId"
              id="bankaccount-currency-select"
              className="addbankaccount-input"
              value={formData.currencyId}
              onChange={handleChange}
            >
              <option value="">Select Currency</option>
              {currencies?.map((currency: any, index) => (
                <option
                  key={currency.id || index}
                  value={
                    isNaN(parseInt(currency.id))
                      ? currency.id
                      : parseInt(currency.id)
                  }
                >
                  {currency.name} ({currency.symbol})
                </option>
              ))}
            </select>
            <p
              className={`addbankaccount-form__error ${
                errors.currencyId ? "addbankaccount-form__error--visible" : ""
              }`}
            >
              <FontAwesomeIcon icon={faQuestionCircle} /> Please select curency
            </p>
          </div>
        </div>
      </form>
      <div className="addbankaccount-button">
        <div className="addbankaccount-button__stat">{onSubmitError?.message}</div>
        <button
          className={`addbankaccount-button__submit ${
            Object.keys(errors).length === 0
              ? "addbankaccount-button__submit--active"
              : ""
          }`}
          onClick={handleSubmit}
        >
          Add Bank Account
        </button>
      </div>
    </div>
  );
}
