// Date-fns format types

type DayToken = 'd' | 'dd' | 'do';
type MonthToken = 'M' | 'MM' | 'MMM' | 'MMMM' | 'L' | 'LL' | 'LLL' | 'LLLL';
type YearToken = 'yy' | 'yyyy' | 'yyy';
type DayOfWeekToken = 'E' | 'EE' | 'EEE' | 'EEEE' | 'EEEEE' | 'EEEEEE';

type Separator = ' ' | '-' | '/' | '.' | ',' | ':' | ';' | '_' | string; // Common date separators

export type DateFormat =
  | `${DayToken}${Separator}${MonthToken}${Separator}${YearToken}` // e.g., "dd-MM-yyyy"
  | `${MonthToken}${Separator}${DayToken}${Separator}${YearToken}` // e.g., "MMM d, yy"
  | `${YearToken}${Separator}${MonthToken}${Separator}${DayToken}` // e.g., "yyyy/MM/dd"
  | `${DayToken}${Separator}${MonthToken}${Separator}${YearToken}${Separator}${DayOfWeekToken}` // e.g., "d MMM yyyy EEEE"
  | `${DayOfWeekToken}${Separator}${DayToken}${Separator}${MonthToken}${Separator}${YearToken}` // e.g., "EEE, dd MMM yyyy"
  | 'MMMM do, yyyy' // e.g., "January 1st, 2023"
  | 'MM/dd/yyyy' // e.g., "12/31/2023"
  | 'dd-MMM-yyyy' // e.g., "31-Dec-2023"
  | 'EEEE, LLLL do, yyyy'; // e.g., "Monday, January 1st, 2023"
