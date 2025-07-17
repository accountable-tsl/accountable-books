import * as React from "react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="table"
        role="table"
        className={cn("flex flex-col w-full caption-bottom text-sm", className)}
        {...props}
      />
    );
  }
);

const TableHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="rowgroup"
      data-slot="table-header"
      className={cn(
        "[&_[data-slot=table-row]]:border-b flex flex-col",
        className
      )}
      {...props}
    />
  );
});

const TableBody = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="rowgroup"
        data-slot="table-body"
        className={cn(
          "flex flex-col [&>div[data-slot=table-row]:last-child]:border-0",
          className
        )}
        {...props}
      />
    );
  }
);

const TableFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="rowgroup"
      data-slot="table-footer"
      className={cn(
        "flex flex-col bg-muted/50 border-t font-medium [&>div[data-slot=table-row]:last]:border-b-0",
        className
      )}
      {...props}
    />
  );
});

const TableRow = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { variant?: "header" | "body" }
>(({ className, variant = "body", ...props }, ref) => {
  return (
    <div
      ref={ref}
      role="row"
      data-slot="table-row"
      data-variant={variant}
      className={cn(
        "flex flex-nowrap w-full items-center border-b transition-all ",
        variant === "header"
          ? "min-h-10 bg-muted/40 data-[state=selected]:bg-muted"
          : "hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  );
});

const baseCellClassNames =
  "flex-1 truncate [&:first-child:has([data-slot=checkbox])]:flex-none [&:first-child:has([data-slot=checkbox])]:border-r-0 [&:first-child_[data-slot=checkbox]]:translate-y-[2px]";

const TableCell = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { variant?: "header" | "body" }
>(({ className, variant = "body", ...props }, ref) => {
  return (
    <div
      ref={ref}
      role={variant === "header" ? "columnheader" : "cell"}
      data-slot={variant === "header" ? "table-header-cell" : "table-cell"}
      data-variant={variant}
      className={cn(
        baseCellClassNames,
        variant === "header" ? "border-r last:border-r-0 px-2" : "p-2",
        className
      )}
      {...props}
    />
  );
});

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableCell };
