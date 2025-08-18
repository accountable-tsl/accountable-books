import { getUserLocale } from '@/shared/utils/random-utils';
import Decimal from 'decimal.js';

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

type DisplayScale = 'unit' | 'thousands' | 'millions' | 'billions';

type CurrencyDisplayType = 'symbol' | 'narrowSymbol' | 'code' | 'name';

type FormatAmountBase = {
  amount: number | string;
  currency?: string;
  locale?: string;
  showSymbol?: boolean;
  showCode?: boolean;
  minFractionDigits?: number;
  maxFractionDigits?: number;
  accountingNegatives?: boolean; // (xxx.xx) instead of -xxx.xx
  currencyDisplay?: CurrencyDisplayType;
  symbolPosition?: 'prefix' | 'suffix';
  codePosition?: 'prefix' | 'suffix';
  separator?: string; // Optional, e.g., " " or "\u00A0"
  displayScale?: DisplayScale;
  scaleSuffix?: string | Record<DisplayScale, string>;
  scaleSuffixPosition?: 'prefix' | 'suffix';
};
type FormattedAmountProps = FormatAmountBase & {
  symbolClassName?: string;
  codeClassName?: string;
  valueClassName?: string;
  className?: string;
  scaleSuffix?: string | Record<DisplayScale, string>;
  scaleSuffixClassName?: string;
};

const DEFAULT_SCALE_SUFFIXES: Record<DisplayScale, string> = {
  unit: '',
  thousands: 'K',
  millions: 'M',
  billions: 'B',
};

const formatAmountForRendering = (
  options: FormatAmountBase,
): {
  isNegative: boolean;
  formattedParts: Intl.NumberFormatPart[];
  formattedString: string;
  scaledNum: number;
  suffix: string;
} => {
  const {
    amount,
    currency,
    locale = 'en-US',
    showSymbol = false,
    currencyDisplay = 'narrowSymbol',
    minFractionDigits = 2,
    maxFractionDigits = 2,
    displayScale = 'unit',
    scaleSuffix,
  } = options;

  const blankResult = {
    isNegative: false,
    formattedParts: [],
    formattedString: '',
    scaledNum: 0,
    suffix: '',
  };
  let num: number;
  if (typeof amount === 'number') num = amount;
  else if (typeof amount === 'string') num = parseFloat(amount);
  else if (amount instanceof Decimal) num = amount.toNumber();
  else num = 0;

  if (isNaN(num)) return blankResult;

  const isNegative = num < 0;
  let scaledNum = Math.abs(num);

  const scaleFactors = {
    unit: 1,
    thousands: 1000,
    millions: 1_000_000,
    billions: 1_000_000_000,
  };

  scaledNum = scaledNum / scaleFactors[displayScale];

  // Get scale suffix
  const getSuffix = (): string => {
    if (typeof scaleSuffix === 'string') return scaleSuffix;
    if (typeof scaleSuffix === 'object') return scaleSuffix[displayScale] || '';
    return DEFAULT_SCALE_SUFFIXES[displayScale];
  };

  const suffix = getSuffix();

  const useCurrency = currency && showSymbol && /^[A-Z]{3}$/.test(currency.toString());

  const formatOptions: Intl.NumberFormatOptions = useCurrency
    ? {
        style: 'currency',
        currency: currency as string,
        currencyDisplay,
        minimumFractionDigits: minFractionDigits,
        maximumFractionDigits: maxFractionDigits,
      }
    : {
        style: 'decimal',
        minimumFractionDigits: minFractionDigits,
        maximumFractionDigits: maxFractionDigits,
      };

  let formattedParts: Intl.NumberFormatPart[] = [];
  let formattedString = '';

  try {
    formattedParts = new Intl.NumberFormat(locale, formatOptions).formatToParts(scaledNum);
    formattedString = new Intl.NumberFormat(locale, formatOptions).format(scaledNum);
  } catch (error) {
    formattedString = String(num);
  }

  return {
    isNegative,
    formattedParts,
    formattedString,
    scaledNum,
    suffix,
  };
};

export const FormattedAmount = ({
  amount,
  currency,
  locale = getUserLocale(),
  showSymbol = false,
  showCode = false,
  currencyDisplay = 'narrowSymbol',
  minFractionDigits = 2,
  maxFractionDigits = 2,
  accountingNegatives = true,
  symbolPosition = 'prefix',
  codePosition = 'suffix',
  className = '',
  valueClassName = '',
  symbolClassName = '',
  codeClassName = '',
  separator = '\u00A0', // Non-breaking space by default
  displayScale = 'unit',
  scaleSuffix,
  scaleSuffixClassName = '',
  scaleSuffixPosition = 'suffix',
}: FormattedAmountProps) => {
  const { isNegative, formattedParts, scaledNum, suffix } = formatAmountForRendering({
    amount,
    currency,
    locale,
    showSymbol,
    currencyDisplay,
    minFractionDigits,
    maxFractionDigits,
    displayScale,
    scaleSuffix,
  });

  let symbolPart: React.ReactNode = null;
  const numberParts: React.ReactNode[] = [];

  formattedParts.forEach((part, idx) => {
    if (part.type === 'currency' && showSymbol) {
      symbolPart = (
        <span key={`symbol-${idx}`} className={symbolClassName}>
          {part.value}
        </span>
      );
    } else if (part.type !== 'currency') {
      numberParts.push(<span key={`${part.type}-${idx}`}>{part.value}</span>);
    }
  });

  const scaleElement = suffix ? <span className={scaleSuffixClassName}>{suffix}</span> : null;

  const numberWithSuffix =
    scaleSuffixPosition === 'prefix' ? (
      <>
        {scaleElement}
        {scaleElement && separator}
        <span className={valueClassName}>{numberParts}</span>
      </>
    ) : (
      <>
        <span className={valueClassName}>{numberParts}</span>
        {scaleElement && separator}
        {scaleElement}
      </>
    );

  const safeCurrency =
    typeof currency === 'string' && currency.trim().length > 0 ? currency : undefined;

  // Add currency code if requested
  const codeElement =
    showCode && safeCurrency ? <span className={codeClassName}>{safeCurrency}</span> : null;

  const symbolGroup = symbolPart ? (
    <span className={`symbol-group ${symbolClassName}`}>{symbolPart}</span>
  ) : null;

  const codeGroup = codeElement ? (
    <span className={`currency-code-group ${codeClassName}`}>{codeElement}</span>
  ) : null;

  const numberGroup = (
    <span className={`number-group ${valueClassName}`}>
      {isNegative && accountingNegatives ? <>({numberWithSuffix})</> : numberWithSuffix}
    </span>
  );

  const finalValue = (
    <span className={className}>
      {codePosition === 'prefix' && codeGroup}
      {codePosition === 'prefix' && codeGroup && symbolGroup && separator}
      {symbolPosition === 'prefix' && symbolGroup}
      {(symbolPosition === 'prefix' && symbolGroup && numberGroup) ||
      (codePosition === 'prefix' && codeGroup && numberGroup && !symbolGroup)
        ? separator
        : null}
      {numberGroup}
      {symbolPosition === 'suffix' && numberGroup && symbolGroup && separator}
      {symbolPosition === 'suffix' && symbolGroup}
      {codePosition === 'suffix' && (symbolGroup || numberGroup) && codeGroup && separator}
      {codePosition === 'suffix' && codeGroup}
    </span>
  );

  // Handle negative formatting
  const content = (() => {
    if (isNegative && accountingNegatives) {
      return (
        <span aria-label={`negative ${scaledNum} ${currency || ''}`} className={className}>
          {/* Code group (prefix) */}
          {codePosition === 'prefix' && codeGroup}
          {/* Separator between code and symbol */}
          {codePosition === 'prefix' && codeGroup && symbolGroup && separator}
          {/* Symbol group (prefix) */}
          {symbolPosition === 'prefix' && symbolGroup}
          {/* Separator between code/symbol and number */}
          {(codePosition === 'prefix' && codeGroup && numberGroup && !symbolGroup) ||
          (symbolPosition === 'prefix' && symbolGroup && numberGroup)
            ? separator
            : null}
          {/* Number group */}
          {numberGroup}
          {/* Separator after number and before symbol (suffix) */}
          {symbolPosition === 'suffix' && numberGroup && symbolGroup && separator}
          {/* Symbol group (suffix) */}
          {symbolPosition === 'suffix' && symbolGroup}
          {/* Separator after symbol and before code (suffix) */}
          {codePosition === 'suffix' && symbolGroup && codeGroup && separator}
          {/* Code group (suffix) */}
          {codePosition === 'suffix' && codeGroup}
        </span>
      );
    } else if (isNegative) {
      // Regular negative with minus sign
      return (
        <span aria-label={`negative ${scaledNum} ${currency || ''}`} className={className}>
          <span className={valueClassName}>-</span>
          {finalValue}
        </span>
      );
    } else {
      // Positive number
      return (
        <span aria-label={`${scaledNum} ${currency || ''}`} className={className}>
          {finalValue}
        </span>
      );
    }
  })();

  return <>{content}</>;
};
