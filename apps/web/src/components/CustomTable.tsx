import * as React from 'react';

import { cn } from '@/lib/utils';

import { getColumnStyle } from './data-table/utils/column-sizing';

const Table = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="table"
        role="table"
        className={cn(
          'scrollbar-thin-2px relative flex min-h-0 flex-1 caption-bottom flex-col overflow-x-auto overflow-y-auto text-sm select-none',
          className,
        )}
        {...props}
      />
    );
  },
);

const TableHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="rowgroup"
      data-slot="table-header"
      className={cn(
        'bg-background sticky top-0 z-30 flex w-full min-w-max shrink-0 flex-col whitespace-nowrap [&_[data-slot=table-row]]:border-b',
        className,
      )}
      {...props}
    />
  );
});

const TableBody = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="rowgroup"
        data-slot="table-body"
        className={cn(
          'relative flex min-h-0 w-full min-w-max flex-col [&>div[data-slot=table-row]:last-child]:border-0',
          className,
        )}
        {...props}
      />
    );
  },
);

const TableFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="rowgroup"
      data-slot="table-footer"
      className={cn(
        'bg-muted/50 flex flex-col border-t font-medium [&>div[data-slot=table-row]:last-child]:border-b-0',
        className,
      )}
      {...props}
    />
  );
});

const TableRow = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & { variant?: 'header' | 'body' }
>(({ className, variant = 'body', ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="row"
      data-slot="table-row"
      data-variant={variant}
      className={cn(
        'relative flex w-full min-w-max border-collapse flex-nowrap items-center border-b transition-all',
        variant === 'header'
          ? 'bg-muted/40 data-[state=selected]:bg-muted h-10 min-h-10'
          : 'bg-background hover:bg-muted data-[state=selected]:bg-muted min-h-0',
        className,
      )}
      {...props}
    />
  );
});

const baseCellClassNames =
  'block truncate min-w-0 relative flex-shrink-0' +
  ' [&:first-child:has([data-slot=checkbox])]:flex-none' +
  ' [&:first-child:has([data-slot=checkbox])]:text-clip' +
  ' [&:first-child:has([data-slot=checkbox])]:border-r-0' +
  ' [&:first-child_[data-slot=checkbox]]:translate-y-[2px]';

const colStyle = getColumnStyle({});

const TableCell = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    variant?: 'header' | 'body';
    width?: string | number;
  }
>(({ className, variant = 'body', ...props }, ref) => {
  return (
    <div
      ref={ref}
      role={variant === 'header' ? 'columnheader' : 'cell'}
      data-slot={variant === 'header' ? 'table-header-cell' : 'table-cell'}
      data-variant={variant}
      style={colStyle}
      className={cn(
        baseCellClassNames,
        variant === 'header' ? 'border-r px-2 last:border-r-0' : 'p-2',
        className,
      )}
      // style={{
      //   width: width,
      //   flexBasis: width,
      //   ...style,
      // }}
      {...props}
    />
  );
});

export { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow };
