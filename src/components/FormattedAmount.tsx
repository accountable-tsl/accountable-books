import { FormatAmountOptions } from "@/shared/utils/formattingUtils";
import { getUserLocale } from "@/shared/utils/randomUtils";
import Decimal from "decimal.js";

/**
 * FormattedAmount
 * -----------------------------------------------------------------------------
 * A reusable React component for displaying currency or numeric amounts with
 * customizable formatting, styling, and locale support.
 *
 * Features:
 * - Supports `number`, `string`, or `Decimal` types for amount.
 * - Locale-aware formatting using Intl.NumberFormat (default: user's locale).
 * - Optional display of currency symbol and/or code.
 * - Optional “accounting style” negatives (parentheses for negatives).
 * - Separately stylable symbol, value, and code for UI polish.
 * - Handles custom decimal precision.
 *
 * -----------------------------------------------------------------------------
 */

type FormattedAmountProps = FormatAmountOptions & {
  amount: number | string | Decimal;
  className?: string;
  valueClassName?: string;
  symbolClassName?: string;
  codeClassName?: string;
};
export const FormattedAmount: React.FC<FormattedAmountProps> = ({
  amount,
  currency,
  locale = getUserLocale(),
  showSymbol = false,
  showCode = false,
  minFractionDigits = 2,
  maxFractionDigits = 2,
  accountingNegatives = false,

  className = "",
  valueClassName = "",
  symbolClassName = "",
  codeClassName = "",
}) => {
  let num: number;
  if (typeof amount === "number") num = amount;
  else if (typeof amount === "string") num = parseFloat(amount);
  else if (amount instanceof Decimal) num = amount.toNumber();
  else num = 0;

  if (isNaN(num)) return null;

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formatOptions =
    currency && showSymbol ? { style: "currency" as const, currency } : {};

  const parts = new Intl.NumberFormat(locale, {
    ...formatOptions,
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).formatToParts(absNum);

  // Compose output
  const rendered = parts
    .map((part, idx) => {
      const { type, value } = part;
      switch (type) {
        case "currency":
          return showSymbol ? (
            <span key={idx} className={symbolClassName}>
              {value}
            </span>
          ) : null;

        case "integer":
        case "group":
        case "decimal":
        case "fraction":
        case "minusSign":
          return (
            <span key={idx} className={valueClassName}>
              {value}
            </span>
          );

        default:
          return <span key={idx}>{value}</span>;
      }
    })
    .filter(Boolean);

  // Handle negatives & accounting style
  const content =
    accountingNegatives && isNegative ? (
      <span>({rendered})</span>
    ) : isNegative ? (
      <span>
        <span className={valueClassName}>-</span>
        {rendered}
      </span>
    ) : (
      <span>{rendered}</span>
    );

  return (
    <span className={className}>
      {content}
      {showCode && <span className={codeClassName}>&nbsp;{currency}</span>}
    </span>
  );
};
