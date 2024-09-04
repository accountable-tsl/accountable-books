import "./AddBankAccount.scss";
import { usePopup } from "../../contexts/PopupContext";
import { fetchBank } from "../../services/BankServices";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";

export default function AddBankAccount() {
  const { closePopup } = usePopup();

  const [banks, setBanks] = useState([]);

  const handleFetchBank = async () => {
    const banks = await fetchBank();
    console.log(banks.data);
    banks.success === true && setBanks(banks.data);
  };

  useEffect(() => {
    handleFetchBank();
  }, []);

  return (
    <div className="addbankaccount">
      <div className="addbankaccount-header">Add Bank Account</div>
      <form action="" className="addbankaccount-form">
        <div className="addbankaccount-form__item">
          <label className="addbankaccount-label">Bank *</label>
          <select name="bank" id="bank-select" className="addbankaccount-input">
            <option value="">Select Bank</option>
            {banks.map((bank: any) => (
              <option key={bank.bankId} value={bank.bankName}>
                <div>{bank.bankName}</div>
              </option>
            ))}
          </select>
          <p className={`addbankaccount-form__error`}>
            <FontAwesomeIcon icon={faQuestionCircle} /> Bank is required
          </p>
        </div>
        <div className="addbankaccount-form__item">
          <label className="addbankaccount-label">Account Name *</label>
          <input type="text" className="addbankaccount-input" />
          <p className={`addbankaccount-form__error`}>
            <FontAwesomeIcon icon={faQuestionCircle} /> Bank Account Name is
            required
          </p>
        </div>
        <div className="addbankaccount-form__item">
          <label className="addbankaccount-label">Account Number *</label>
          <input type="text" className="addbankaccount-input" />
          <p className={`addbankaccount-form__error`}>
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
              name="bankaccount-type"
              id="bankaccount-type-select"
              className="addbankaccount-input"
            >
              <option value="OTHER">Other</option>
              <option value="CREDIT_CARD">Credit Card</option>
              <option value="DEBIT_CARD">Debit Card</option>
              <option value="SAVINGS">Savings</option>
              <option value="CHECKINGS_CURRENT">Checkings/Current</option>
              <option value="UTILITY">Utility</option>
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
              name="currency"
              id="bankaccount-currency-select"
              className="addbankaccount-input"
            >
              <option value="">Select Currency</option>
              <option value="NGN">Naira (₦)</option>
              <option value="USD">US Dollar ($)</option>
              <option value="GBP">British Pounds (£)</option>
              <option value="EUR">Euro (€)</option>
            </select>
            <p className={`addbankaccount-form__error`}>
              <FontAwesomeIcon icon={faQuestionCircle} /> Please select curency
            </p>
          </div>
        </div>
      </form>
      <div className="addbankaccount-button"></div>
    </div>
  );
}
