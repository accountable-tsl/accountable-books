# 📊 Financial Statements Generation

> **Priority:** HIGH - Core deliverable  
> **Dependencies:** Transaction processing pipeline must be complete  
> **Goal:** Generate accurate P&L and Balance Sheet from ledger entries

## 🎯 **What We're Building**

Financial reports that:

1. Pull data from immutable ledger_entries table
2. Respect accounting basis (cash vs. accrual)
3. Handle multi-currency with proper exchange rates
4. Support comparative periods
5. Export to PDF/Excel

## 📋 **Implementation Plan**

### **Profit & Loss Statement**

**Core Query Structure:**

```sql
-- P&L for a period
WITH period_entries AS (
  SELECT
    le.coa_id,
    coa.account_code,
    coa.account_name,
    coa.account_element,
    coa.account_type,
    SUM(le.amount) as period_amount
  FROM ledger_entries le
  JOIN coa ON le.coa_id = coa.id
  WHERE
    le.company_id = $1
    AND le.fs_date BETWEEN $2 AND $3
    AND le.is_deleted = false
    AND coa.account_element IN ('revenue', 'expense')
  GROUP BY le.coa_id, coa.account_code, coa.account_name, coa.account_element, coa.account_type
)
SELECT
  account_element,
  account_type,
  account_code,
  account_name,
  ABS(period_amount) as amount,
  CASE
    WHEN account_element = 'revenue' THEN -period_amount
    ELSE period_amount
  END as signed_amount
FROM period_entries
ORDER BY account_element DESC, account_code;
```

**Service Implementation:**

```typescript
// apps/api/src/features/reports/profitLossService.ts
class ProfitLossService {
  async generate(
    companyId: string,
    dateRange: { start: Date; end: Date },
    options?: ReportOptions,
  ): Promise<ProfitLossStatement> {
    // 1. Get period data
    const entries = await this.getPeriodEntries(companyId, dateRange);

    // 2. Structure by categories
    const structured = {
      revenue: {
        operatingRevenue: entries.filter((e) => e.account_type === 'operating_revenue'),
        otherRevenue: entries.filter((e) => e.account_type === 'other_revenue'),
        total: 0,
      },
      expenses: {
        costOfGoodsSold: entries.filter((e) => e.account_type === 'cogs'),
        operatingExpenses: entries.filter((e) => e.account_type === 'operating_expense'),
        otherExpenses: entries.filter((e) => e.account_type === 'other_expense'),
        total: 0,
      },
    };

    // 3. Calculate totals
    structured.revenue.total = this.sumEntries(structured.revenue);
    structured.expenses.total = this.sumEntries(structured.expenses);

    // 4. Calculate net income
    const netIncome = structured.revenue.total - structured.expenses.total;

    // 5. Add comparative period if requested
    let comparative = null;
    if (options?.includeComparative) {
      const priorPeriod = this.getPriorPeriod(dateRange);
      comparative = await this.generate(companyId, priorPeriod);
    }

    return {
      companyId,
      period: dateRange,
      revenue: structured.revenue,
      expenses: structured.expenses,
      netIncome,
      comparative,
      generatedAt: new Date(),
    };
  }
}
```

### **Balance Sheet**

**Core Query:**

```sql
-- Balance Sheet as of date
WITH balance_entries AS (
  SELECT
    coa.account_element,
    coa.account_type,
    coa.account_code,
    coa.account_name,
    SUM(le.amount) as balance
  FROM ledger_entries le
  JOIN coa ON le.coa_id = coa.id
  WHERE
    le.company_id = $1
    AND le.fs_date <= $2
    AND le.is_deleted = false
    AND coa.account_element IN ('asset', 'liability', 'equity')
  GROUP BY coa.account_element, coa.account_type, coa.account_code, coa.account_name
  HAVING SUM(le.amount) != 0
)
SELECT * FROM balance_entries
ORDER BY
  CASE account_element
    WHEN 'asset' THEN 1
    WHEN 'liability' THEN 2
    WHEN 'equity' THEN 3
  END,
  account_code;
```

**Service Implementation:**

```typescript
class BalanceSheetService {
  async generate(
    companyId: string,
    asOfDate: Date,
    options?: ReportOptions,
  ): Promise<BalanceSheet> {
    const entries = await this.getBalanceEntries(companyId, asOfDate);

    const structured = {
      assets: {
        current: entries.filter((e) => e.account_type === 'current_asset'),
        nonCurrent: entries.filter((e) => e.account_type === 'non_current_asset'),
        total: 0,
      },
      liabilities: {
        current: entries.filter((e) => e.account_type === 'current_liability'),
        nonCurrent: entries.filter((e) => e.account_type === 'non_current_liability'),
        total: 0,
      },
      equity: {
        capitalStock: entries.filter((e) => e.account_type === 'capital_stock'),
        retainedEarnings: await this.calculateRetainedEarnings(companyId, asOfDate),
        currentPeriodEarnings: await this.getCurrentPeriodEarnings(companyId, asOfDate),
        total: 0,
      },
    };

    // Calculate totals
    structured.assets.total = this.sumEntries(structured.assets);
    structured.liabilities.total = this.sumEntries(structured.liabilities);
    structured.equity.total = this.sumEntries(structured.equity);

    // Validate balance sheet equation
    const difference =
      structured.assets.total - (structured.liabilities.total + structured.equity.total);

    if (Math.abs(difference) > 0.01) {
      console.warn(`Balance sheet doesn't balance! Difference: ${difference}`);
    }

    return structured;
  }
}
```

### **Export Functionality**

**PDF Generation:**

```typescript
import PDFDocument from 'pdfkit';

class ReportExporter {
  async exportToPDF(
    report: ProfitLossStatement | BalanceSheet,
    type: 'pl' | 'bs',
  ): Promise<Buffer> {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    // Header
    doc
      .fontSize(20)
      .text(type === 'pl' ? 'Profit & Loss Statement' : 'Balance Sheet', { align: 'center' });

    doc.fontSize(12).text(`Period: ${this.formatPeriod(report.period)}`, { align: 'center' });

    // Content based on type
    if (type === 'pl') {
      this.renderProfitLoss(doc, report as ProfitLossStatement);
    } else {
      this.renderBalanceSheet(doc, report as BalanceSheet);
    }

    doc.end();

    return Buffer.concat(chunks);
  }

  async exportToExcel(report: ProfitLossStatement | BalanceSheet): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Financial Statement');

    // Add headers and data
    // ... Excel formatting logic

    return workbook.xlsx.writeBuffer();
  }
}
```

### **API Endpoints**

```typescript
// Profit & Loss
router.get('/reports/profit-loss', async (req, res) => {
  const { startDate, endDate, comparative } = req.query;

  const report = await profitLossService.generate(
    req.company.id,
    { start: new Date(startDate), end: new Date(endDate) },
    { includeComparative: comparative === 'true' },
  );

  res.json(report);
});

// Balance Sheet
router.get('/reports/balance-sheet', async (req, res) => {
  const { asOfDate } = req.query;

  const report = await balanceSheetService.generate(req.company.id, new Date(asOfDate));

  res.json(report);
});

// Export
router.get('/reports/:type/export/:format', async (req, res) => {
  const { type, format } = req.params;
  const report = await this.generateReport(type, req.query);

  const buffer =
    format === 'pdf'
      ? await exporter.exportToPDF(report, type)
      : await exporter.exportToExcel(report);

  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel');
  res.send(buffer);
});
```

### **Frontend Components**

```tsx
function FinancialReports() {
  const [reportType, setReportType] = useState<'pl' | 'bs'>('pl');
  const [dateRange, setDateRange] = useState(getCurrentMonthRange());
  const [report, setReport] = useState(null);

  const generateReport = async () => {
    const data =
      reportType === 'pl'
        ? await api.getProfitLoss(dateRange)
        : await api.getBalanceSheet(dateRange.end);

    setReport(data);
  };

  const exportReport = async (format: 'pdf' | 'excel') => {
    const blob = await api.exportReport(reportType, format, dateRange);
    downloadBlob(blob, `${reportType}_${dateRange.start}_${format}`);
  };

  return (
    <div>
      <ReportControls
        type={reportType}
        onTypeChange={setReportType}
        dateRange={dateRange}
        onDateChange={setDateRange}
        onGenerate={generateReport}
      />

      {report && (
        <>
          {reportType === 'pl' ? (
            <ProfitLossDisplay report={report} />
          ) : (
            <BalanceSheetDisplay report={report} />
          )}

          <ExportButtons onExport={exportReport} />
        </>
      )}
    </div>
  );
}
```

---

## ✅ **Success Criteria**

- [ ] P&L statement generates correctly from ledger entries
- [ ] Balance Sheet balances (Assets = Liabilities + Equity)
- [ ] Multi-currency handling with exchange rates
- [ ] Comparative period analysis
- [ ] PDF and Excel export working
- [ ] Sub-2 second generation for standard reports
- [ ] Accounting basis respected (cash vs. accrual)

## 🔥 **Critical Points**

1. **Data Source**: ONLY use ledger_entries table (immutable, auditable)
2. **Balance Validation**: Balance Sheet must always balance
3. **Sign Convention**: Revenue is negative in ledger, show as positive in reports
4. **Period Accuracy**: Ensure date ranges are handled correctly
5. **Currency**: Handle multi-currency with proper exchange rates

---

**Remember:** Financial statements are the ultimate output of the entire system. They must be 100% accurate and defensible to auditors.
