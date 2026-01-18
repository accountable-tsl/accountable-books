# Payroll Tool - Total Quality Management Document

## Executive Summary

This document outlines the complete scope, architecture, and implementation strategy for the Nigerian Payroll Tool MVP, focusing on delivering a production-ready solution in 1 week while maintaining high quality standards and excellent user experience.

**Target Launch**: Week of January 6, 2026 (aligning with Nigeria's 2026 tax reform implementation)

**Domain**: `payroll.getaccountable.com`

**Core Principle**: Fast execution balanced with exceptional user experience - no compromises on correctness, but smart defaults and progressive disclosure for speed.

---

## 1. Guest Session Management Strategy

### Problem Statement
How do we handle multiple guest payroll runs without requiring authentication, while maintaining data integrity and enabling smooth migration to authenticated accounts?

### Solution: Anonymous Session with Migration Path

**Architecture Decision**: Anonymous Session ID + LocalStorage + Optional Backend Persistence

#### Implementation Approach

1. **Session Generation**
   - Generate unique anonymous session ID on first visit: `anon_${uuidv7()}`
   - Store in `localStorage` with key: `payroll_anon_session_id`
   - Backend creates lightweight session record (no PII, just session metadata)

2. **Data Storage Strategy**
   ```
   localStorage:
   - payroll_anon_session_id: "anon_abc123..."
   - payroll_runs: [{ runId, timestamp, metadata }] // Index only
   
   IndexedDB (preferred) or localStorage (fallback):
   - payroll_run_{runId}: { employees, config, computed, overrides }
   ```

3. **Session Limits (Guest)**
   - **One active run at a time** per session (simplifies UX, prevents confusion)
   - User can "Start New Run" which:
     - Saves current run to history (if not empty)
     - Clears current run state
     - Creates new run ID
   - History shows last 5 runs (local only, until saved to account)

4. **Migration to Authenticated Account**
   - When user clicks "Save for next month" after successful export:
     - Prompt: "Create account to save this payroll run?"
     - On signup/login:
       - Transfer all localStorage/IndexedDB runs to backend
       - Associate with user account
       - Clear local storage (optional: keep as backup for 30 days)

5. **IP-Based Rate Limiting (Backend)**
   - Track anonymous sessions by IP + User-Agent fingerprint
   - Limit: 10 runs per IP per day (prevents abuse)
   - VPN users: Still limited, but can create account for unlimited runs
   - Rate limit headers: `X-RateLimit-Remaining: 5`

### Why This Approach?

✅ **Fast to implement**: Simple localStorage + IndexedDB pattern  
✅ **Good UX**: No data loss, smooth migration path  
✅ **Privacy-first**: No PII sent to server until user opts in  
✅ **Scalable**: Can handle growth, easy to migrate later  
✅ **VPN-friendly**: Account creation removes limits  

### Alternative Considered: IP-Only Tracking
❌ **Rejected**: VPN users blocked, no migration path, unreliable

---

## 2. CSV Import Strategy

### Problem Statement
Should we support simple CSV (name, amount, state) or full-fledged CSV (all employee details), or both?

### Solution: User-Choice Format Selection

**Architecture Decision**: Format Selection Before Upload + Auto-Detection Fallback

#### Implementation Approach

1. **Format Selection UI**
   ```
   [ ] Simple Format (Quick Start)
       Columns: Name, Gross Salary, State
       Best for: Quick calculations, small teams
   
   [ ] Full Format (Complete Details)
       Columns: Employee ID, Name, Role, Join Date, Exit Date, 
                State, Tax ID, PFA, RSA PIN, NHF, NHIS, 
                Rent, Rent Period, Basic, Housing, Transport, Others
       Best for: Detailed payroll, compliance, recurring use
   ```

2. **CSV Template Downloads**
   - Provide downloadable templates for both formats
   - Include sample data rows
   - Column headers clearly labeled
   - Validation rules documented in template comments

3. **Auto-Detection (Fallback)**
   - If user uploads without selecting format:
     - Detect column count and names
     - If matches simple format → use simple
     - If matches full format → use full
     - If ambiguous → show format selection dialog with detected columns highlighted

4. **Data Mapping**
   - Simple format → map to full format with defaults:
     - State: Required (dropdown in template or required in CSV)
     - Pension: Use default settings from run config
     - Other fields: Empty/null, editable in UI
   - Full format → use all provided data

5. **Validation & Error Handling**
   - Row-level validation with clear error messages
   - Highlight problematic rows in UI
   - Allow partial import (skip invalid rows with warning)
   - Export validation report (CSV of errors)

### Why This Approach?

✅ **User control**: Clear choice, no guessing  
✅ **Fast implementation**: Simple conditional logic  
✅ **Progressive enhancement**: Start simple, add details later  
✅ **Flexible**: Supports both use cases  
✅ **Good UX**: Templates guide users, auto-detect helps  

### Alternative Considered: Auto-Detect Only
❌ **Rejected**: Ambiguity causes errors, poor UX for users unsure of format

---

## 3. File Replacement Handling

### Problem Statement
What happens when a user uploads a new CSV file while they already have employee data loaded?

### Solution: Confirmation Dialog with Clear Options

**Architecture Decision**: Warning Dialog + Replace with Undo Option

#### Implementation Approach

1. **Detection Logic**
   - Check if current run has employees: `if (currentRun.employees.length > 0)`
   - If yes → show confirmation dialog
   - If no → proceed directly

2. **Confirmation Dialog**
   ```
   ⚠️ Replace Current Employees?
   
   You have {count} employees loaded. Uploading a new file will 
   replace all current employees with the new data.
   
   Current employees will be lost unless you save this run first.
   
   [Cancel]  [Save Current Run First]  [Replace Anyway]
   ```

3. **User Options**
   - **Cancel**: Close dialog, keep current data
   - **Save Current Run First**: 
     - If guest → prompt to create account or download backup
     - If authenticated → save to backend, then proceed with upload
   - **Replace Anyway**: 
     - Clear current employees
     - Load new CSV
     - Show toast: "Previous data replaced. {count} employees loaded."

4. **Undo Functionality (Optional, Week 1+ Enhancement)**
   - Store previous state in session
   - Show "Undo Replace" button for 30 seconds after replace
   - Restore previous employees on click

5. **Multiple File Upload**
   - If user tries to upload multiple files:
     - Show warning: "Only one file can be loaded at a time"
     - Allow user to merge manually via UI (Week 2+ feature)
   - For MVP: One file at a time

### Why This Approach?

✅ **Protects users**: Prevents accidental data loss  
✅ **Simple to implement**: Basic confirmation dialog  
✅ **Clear communication**: Users understand consequences  
✅ **Flexible**: Options for different user needs  

### Alternative Considered: Auto-Replace
❌ **Rejected**: Too risky, users lose data accidentally

---

## 4. Mobile Experience & PWA Strategy

### Problem Statement
How do we ensure the payroll tool works excellently on mobile devices, and should we make it a Progressive Web App (PWA)?

### Solution: Mobile-First Responsive Design + PWA (Week 1 MVP)

**Architecture Decision**: Responsive UI + PWA with Offline Capability

#### Mobile UX Considerations

1. **Layout Strategy**
   - **Desktop**: Multi-column layout, side-by-side views
   - **Tablet**: Stacked layout, collapsible sections
   - **Mobile**: Single column, full-width cards, bottom sheet modals

2. **Key Mobile Optimizations**
   - **Touch Targets**: Minimum 44x44px (Apple HIG), 48x48px (Material)
   - **Form Inputs**: Large, easy-to-tap fields
   - **Tables**: Horizontal scroll with sticky headers, or card view toggle
   - **File Upload**: Native file picker, drag-drop disabled on mobile
   - **Navigation**: Bottom tab bar or hamburger menu (test both)

3. **Performance**
   - Lazy load employee table (virtual scrolling for 100+ employees)
   - Optimize CSV parsing (chunk processing, show progress)
   - Compress images/icons
   - Code splitting for routes

4. **PWA Implementation (Week 1)**
   ```json
   // manifest.json
   {
     "name": "Accountable Payroll",
     "short_name": "Payroll",
     "start_url": "/",
     "display": "standalone",
     "theme_color": "#000000",
     "background_color": "#ffffff",
     "icons": [
       { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
     ]
   }
   ```

5. **Service Worker Strategy**
   - **Week 1**: Basic caching (static assets, app shell)
   - **Week 2+**: Offline support for viewing saved runs
   - **Cache Strategy**: Cache-first for static assets, network-first for API calls

6. **Mobile-Specific Features**
   - **Camera CSV Import**: Take photo of printed payroll → OCR (Week 2+)
   - **Share Sheet**: Share payroll summary via WhatsApp/Email
   - **Haptic Feedback**: Subtle vibrations on key actions (iOS/Android)
   - **Pull to Refresh**: Refresh run data

7. **Testing Strategy**
   - Test on real devices: iPhone (Safari), Android (Chrome)
   - Test on various screen sizes: 320px (small) to 1920px (large)
   - Test PWA install flow on iOS and Android
   - Test offline behavior

### Why PWA in Week 1?

✅ **Fast to implement**: Vite PWA plugin, minimal config  
✅ **Better UX**: Installable, feels native, works offline  
✅ **Marketing**: "Install our app" messaging  
✅ **Performance**: Cached assets load faster  

### Mobile UI Patterns

**Employee List (Mobile)**
```
┌─────────────────────────┐
│ [Search] [Filter] [Add] │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ John Doe            │ │
│ │ ₦150,000            │ │
│ │ Lagos State         │ │
│ │ [View Details →]    │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ Jane Smith          │ │
│ │ ₦200,000            │ │
│ │ FCT                 │ │
│ │ [View Details →]    │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

**Computation View (Mobile)**
```
┌─────────────────────────┐
│ Payroll Summary         │
├─────────────────────────┤
│ Total Employees: 25     │
│ Total Gross: ₦5,000,000 │
│ Total PAYE: ₦750,000   │
│ Total Net: ₦4,250,000   │
├─────────────────────────┤
│ [View Breakdown]         │
│ [Export Files]          │
│ [Save Run]              │
└─────────────────────────┘
```

---

## 5. Authentication Strategy

### Problem Statement
How do we balance "no forced signup" with "save & reuse" functionality without losing urgent users?

### Solution: Post-Success Signup Prompt

**Architecture Decision**: Guest-first with strategic signup prompts

#### Implementation Flow

1. **Guest Experience (No Auth Required)**
   - User can complete entire payroll flow without account
   - All data stored locally (localStorage/IndexedDB)
   - No server persistence until explicit opt-in

2. **Signup Prompt Timing**
   ```
   Trigger Points (in order of effectiveness):
   
   1. After successful export (PRIMARY)
      "✅ Payroll exported! Save this for next month?"
      [Continue as Guest] [Create Free Account]
   
   2. After 2nd run (if still guest)
      "You've run payroll twice. Create an account to save your data?"
      [Maybe Later] [Sign Up Free]
   
   3. On "Start New Run" (if previous run exists)
      "Save your previous run before starting a new one?"
      [Skip] [Save & Continue]
   ```

3. **Signup Flow**
   - **Minimal fields**: Email + Password (name optional)
   - **Quick**: Single page, no email verification required initially
   - **Value proposition**: "Save your payroll data for next month"
   - **Migration**: Automatically transfer local runs to account

4. **Account Benefits (Messaging)**
   - ✅ Save unlimited payroll runs
   - ✅ Access from any device
   - ✅ Duplicate last month's run
   - ✅ Employee directory management
   - ✅ Run history & reports

5. **Guest Limitations (Soft, Not Hard Blocks)**
   - No hard limits on functionality
   - Gentle reminders: "Create account to save this run"
   - Rate limiting: 10 runs/day per IP (prevents abuse)

### Why This Approach?

✅ **No friction**: Users can complete task immediately  
✅ **Natural conversion**: Signup after value demonstrated  
✅ **Trust building**: Users see product works before committing  
✅ **Urgent users served**: No barriers for time-sensitive needs  

### Conversion Optimization

- **A/B Test**: Different signup prompt copy
- **Track**: Conversion rate at each trigger point
- **Iterate**: Optimize based on data

---

## 6. Week-by-Week Implementation Scope

### Week 1: MVP Launch (Jan 6-12, 2026)

#### Day 1: Foundation & Setup
- [ ] Create `apps/web-payroll` app structure
- [ ] Set up routing (TanStack Router)
- [ ] Configure PWA (manifest, service worker)
- [ ] Set up state management (localStorage/IndexedDB utilities)
- [ ] Create basic layout (header, navigation, responsive)
- [ ] Landing page design

#### Day 2: Employee Management
- [ ] CSV import component (format selection UI)
- [ ] CSV parsing & validation
- [ ] Employee table/grid (desktop + mobile views)
- [ ] Manual employee entry form
- [ ] Employee edit/delete functionality
- [ ] LocalStorage/IndexedDB persistence

#### Day 3: Payroll Computation Engine
- [ ] Create `packages/payroll-core` module
- [ ] Implement 2026 tax ruleset (PAYE calculation)
- [ ] Pension calculation (employee + employer)
- [ ] Gross → Net computation pipeline
- [ ] Override system (manual PAYE/taxable adjustments)
- [ ] Computation UI (breakdown per employee)

#### Day 4: Export Functionality
- [ ] Payroll Excel export (xlsx library)
- [ ] Pension contribution template export
- [ ] PAYE schedule export (generic + state-specific)
- [ ] Export preview/download UI
- [ ] File validation (test with real Excel)

#### Day 5: Backend Integration
- [ ] Database migrations (payroll tables)
- [ ] API endpoints (save run, load run, employee CRUD)
- [ ] Auth integration (signup/login flow)
- [ ] Guest → Account migration logic
- [ ] Rate limiting (anonymous sessions)

#### Day 6: Polish & Mobile
- [ ] Mobile responsive design (test on devices)
- [ ] PWA installation flow
- [ ] Error handling & validation messages
- [ ] Loading states & progress indicators
- [ ] Accessibility audit (keyboard navigation, screen readers)

#### Day 7: QA & Launch
- [ ] End-to-end testing with real accountant data
- [ ] Performance optimization
- [ ] Security audit (XSS, CSRF, data validation)
- [ ] Deploy to `payroll.getaccountable.com`
- [ ] Monitoring setup (error tracking, analytics)
- [ ] Launch checklist completion

### Week 2: Enhancements & Feedback

- [ ] User feedback collection system
- [ ] Additional state templates (Lagos, FCT, Rivers)
- [ ] Run history view (for authenticated users)
- [ ] Duplicate last run functionality
- [ ] Bulk edit employees
- [ ] Improved error messages
- [ ] Performance optimizations

### Week 3-4: Advanced Features

- [ ] Payslip PDF generation
- [ ] Employee directory (persistent, reusable)
- [ ] Multi-entity support (accounting firms)
- [ ] Advanced tax scenarios (arrears, prorations)
- [ ] Bank payment file generation
- [ ] Email payroll summaries

### Month 2: Scale & Optimize

- [ ] Analytics dashboard (usage, conversion, errors)
- [ ] A/B testing framework
- [ ] More state templates (all 36 states + FCT)
- [ ] Template builder UI
- [ ] API for third-party integrations
- [ ] Mobile app (React Native, if demand exists)

---

## 7. Database Schema Design

### Core Tables

```sql
-- Payroll Companies (scoped to user account)
CREATE TABLE payroll_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_state TEXT, -- Nigerian state code
  default_pension_employee_pct DECIMAL(5,2) DEFAULT 8.0,
  default_pension_employer_pct DECIMAL(5,2) DEFAULT 10.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Payroll Employees (reusable directory)
CREATE TABLE payroll_employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  company_id UUID REFERENCES payroll_companies(id) ON DELETE CASCADE,
  employee_id TEXT, -- External ID
  full_name TEXT NOT NULL,
  state TEXT NOT NULL, -- Nigerian state code
  tax_id TEXT,
  pfa TEXT, -- Pension Fund Administrator
  rsa_pin TEXT,
  nhf_enabled BOOLEAN DEFAULT FALSE,
  nhis_enabled BOOLEAN DEFAULT FALSE,
  rent_amount DECIMAL(12,2),
  rent_period TEXT, -- 'monthly', 'yearly'
  basic_salary DECIMAL(12,2),
  housing_allowance DECIMAL(12,2),
  transport_allowance DECIMAL(12,2),
  other_allowances DECIMAL(12,2),
  join_date DATE,
  exit_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Payroll Runs (monthly payroll instances)
CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  company_id UUID REFERENCES payroll_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., "January 2026"
  pay_month INTEGER NOT NULL, -- 1-12
  pay_year INTEGER NOT NULL,
  ruleset_version TEXT NOT NULL DEFAULT 'NG-2026-v1',
  total_gross DECIMAL(12,2),
  total_paye DECIMAL(12,2),
  total_pension_employee DECIMAL(12,2),
  total_pension_employer DECIMAL(12,2),
  total_net DECIMAL(12,2),
  employee_count INTEGER,
  states_covered TEXT[], -- Array of state codes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Payroll Run Items (employee snapshots + computed values)
CREATE TABLE payroll_run_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES payroll_employees(id) ON DELETE SET NULL,
  -- Snapshot data (in case employee is deleted later)
  employee_name TEXT NOT NULL,
  employee_state TEXT NOT NULL,
  -- Computed values
  gross_salary DECIMAL(12,2) NOT NULL,
  taxable_income DECIMAL(12,2) NOT NULL,
  paye_computed DECIMAL(12,2) NOT NULL,
  paye_override DECIMAL(12,2), -- Manual override
  paye_final DECIMAL(12,2) NOT NULL, -- Computed or override
  pension_employee DECIMAL(12,2) NOT NULL,
  pension_employer DECIMAL(12,2) NOT NULL,
  other_deductions DECIMAL(12,2) DEFAULT 0,
  net_pay DECIMAL(12,2) NOT NULL,
  employer_cost DECIMAL(12,2) NOT NULL, -- Gross + employer pension
  -- Override tracking
  has_override BOOLEAN DEFAULT FALSE,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Anonymous Sessions (for guest users)
CREATE TABLE payroll_anonymous_sessions (
  id UUID PRIMARY KEY,
  ip_address INET,
  user_agent TEXT,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

-- Indexes
CREATE INDEX idx_payroll_companies_user_id ON payroll_companies(user_id) WHERE NOT is_deleted;
CREATE INDEX idx_payroll_employees_company_id ON payroll_employees(company_id) WHERE NOT is_deleted;
CREATE INDEX idx_payroll_runs_company_id ON payroll_runs(company_id) WHERE NOT is_deleted;
CREATE INDEX idx_payroll_run_items_run_id ON payroll_run_items(run_id);
CREATE INDEX idx_payroll_anonymous_sessions_ip ON payroll_anonymous_sessions(ip_address);
```

---

## 8. API Endpoints Design

### Guest Endpoints (No Auth Required)

```
POST   /api/payroll/guest/session
       Create anonymous session, return session_id

GET    /api/payroll/guest/session/:sessionId/rate-limit
       Check remaining runs for this session

POST   /api/payroll/guest/compute
       Compute payroll (no persistence, returns computed data)
       Body: { employees: [], config: {} }
       Returns: { computed: {}, summary: {} }
```

### Authenticated Endpoints

```
GET    /api/payroll/runs
       List user's payroll runs

POST   /api/payroll/runs
       Create new payroll run
       Body: { company_id, name, pay_month, pay_year, employees: [] }

GET    /api/payroll/runs/:runId
       Get payroll run details

PUT    /api/payroll/runs/:runId
       Update payroll run

DELETE /api/payroll/runs/:runId
       Delete payroll run

POST   /api/payroll/runs/:runId/duplicate
       Duplicate a run for next month

GET    /api/payroll/companies
       List user's payroll companies

POST   /api/payroll/companies
       Create payroll company

GET    /api/payroll/companies/:companyId/employees
       List employees for a company

POST   /api/payroll/companies/:companyId/employees
       Create employee

PUT    /api/payroll/employees/:employeeId
       Update employee

DELETE /api/payroll/employees/:employeeId
       Delete employee

POST   /api/payroll/migrate-guest
       Migrate guest session data to authenticated account
       Body: { session_id, company_name }
```

---

## 9. UI/UX Design Principles

### Design System

1. **Color Palette**
   - Primary: Accountable brand colors
   - Success: Green for completed actions
   - Warning: Amber for confirmations
   - Error: Red for validation errors
   - Neutral: Gray scale for text/backgrounds

2. **Typography**
   - Headings: Bold, clear hierarchy
   - Body: Readable, 16px minimum on mobile
   - Numbers: Monospace font for financial data

3. **Spacing**
   - Consistent 8px grid system
   - Generous whitespace on mobile
   - Compact but readable on desktop

4. **Components**
   - Reuse existing UI components from `apps/web` where possible
   - Create payroll-specific components (employee card, computation breakdown)
   - Mobile-first component variants

### Key UX Patterns

1. **Wizard Flow**
   ```
   Step 1: Add Employees → Step 2: Configure → Step 3: Compute → Step 4: Review → Step 5: Export
   [Progress indicator at top, can go back/forward]
   ```

2. **Inline Editing**
   - Click to edit employee fields
   - Auto-save on blur
   - Validation feedback

3. **Loading States**
   - Skeleton screens for data loading
   - Progress bars for CSV parsing
   - Optimistic UI updates

4. **Error Handling**
   - Inline validation errors
   - Toast notifications for success/errors
   - Clear error messages with actionable fixes

5. **Empty States**
   - Helpful guidance when no data
   - Quick actions (import CSV, add employee)
   - Sample data option

---

## 10. Testing Strategy

### Unit Tests
- Payroll computation engine (all calculation functions)
- CSV parsing & validation
- Data transformation utilities
- Export generators

### Integration Tests
- API endpoints (guest & authenticated)
- Database operations
- Auth flow (signup, login, migration)

### E2E Tests (Critical Paths)
- Guest user: Upload CSV → Compute → Export
- Authenticated user: Create run → Save → Load → Duplicate
- Mobile: Full flow on mobile device
- Error scenarios: Invalid CSV, network errors, rate limiting

### Manual Testing Checklist
- [ ] Test on iPhone (Safari)
- [ ] Test on Android (Chrome)
- [ ] Test on desktop (Chrome, Firefox, Safari)
- [ ] Test PWA install flow
- [ ] Test offline behavior
- [ ] Test with real accountant CSV files
- [ ] Test export files open correctly in Excel
- [ ] Test all 36 states + FCT (sample data)

---

## 11. Security Considerations

### Data Protection
- **PII Minimization**: No server storage until user opts in
- **Encryption**: HTTPS only, encrypt sensitive data at rest
- **Input Validation**: Sanitize all user inputs, validate CSV data
- **SQL Injection**: Use parameterized queries (Knex handles this)

### Rate Limiting
- Anonymous: 10 runs/day per IP
- Authenticated: 100 runs/day per user
- Export: 50 exports/day per user

### Authentication
- JWT tokens (reuse existing auth system)
- CSRF protection for state-changing operations
- Session timeout: 30 days for authenticated, 1 day for guest

### Privacy
- Clear privacy policy
- Data retention: Guest data deleted after 30 days
- User data: Deleted on account deletion request

---

## 12. Performance Targets

### Core Web Vitals
- **LCP (Largest Contentful Paint)**: < 2.5s
- **FID (First Input Delay)**: < 100ms
- **CLS (Cumulative Layout Shift)**: < 0.1

### Functional Performance
- CSV parsing: < 2s for 100 employees
- Payroll computation: < 1s for 100 employees
- Export generation: < 3s for 100 employees
- Page load: < 3s on 3G connection

### Optimization Strategies
- Code splitting (route-based)
- Lazy loading (employee table, export components)
- Image optimization (WebP format, lazy load)
- Caching (static assets, API responses)

---

## 13. Monitoring & Analytics

### Error Tracking
- Sentry integration (already in project)
- Track: API errors, frontend errors, calculation errors
- Alert on: Error rate > 1%, critical path failures

### Analytics Events
```typescript
// Key events to track
- payroll_run_started (guest/authenticated)
- csv_imported (row_count, format_type)
- payroll_computed (employee_count, states)
- export_generated (type: excel/pension/paye)
- signup_prompt_shown (trigger_point)
- signup_completed (source: prompt_location)
- guest_to_account_migration
```

### Performance Monitoring
- Track API response times
- Monitor database query performance
- Track frontend bundle sizes
- Monitor PWA install rates

---

## 14. Launch Checklist

### Pre-Launch
- [ ] All Week 1 tasks completed
- [ ] End-to-end testing passed
- [ ] Security audit completed
- [ ] Performance targets met
- [ ] Mobile testing completed
- [ ] PWA tested on iOS and Android
- [ ] Error tracking configured
- [ ] Analytics configured
- [ ] Privacy policy published
- [ ] Terms of service published

### Launch Day
- [ ] Deploy to production
- [ ] DNS configured (`payroll.getaccountable.com`)
- [ ] SSL certificate valid
- [ ] Monitoring dashboards active
- [ ] Team briefed on support process
- [ ] Social media announcement ready

### Post-Launch (Week 1)
- [ ] Monitor error rates daily
- [ ] Review user feedback
- [ ] Track conversion metrics
- [ ] Address critical bugs immediately
- [ ] Plan Week 2 enhancements

---

## 15. Risk Mitigation

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Tax rules incorrect | High | Medium | Version ruleset, allow overrides, clear disclaimers |
| CSV parsing fails | Medium | Low | Robust validation, clear error messages, sample templates |
| Performance issues | Medium | Low | Load testing, optimization, monitoring |
| Mobile UX poor | High | Medium | Mobile-first design, device testing, PWA |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Low adoption | High | Medium | Marketing, accountant partnerships, SEO |
| User confusion | Medium | Medium | Clear UI, help text, sample data |
| Compliance issues | High | Low | Legal review, disclaimers, version rulesets |

---

## 16. Success Metrics

### Week 1 Targets
- 100+ payroll runs completed
- 10+ accounts created
- < 5% error rate
- < 3s average page load
- 80%+ mobile usage

### Month 1 Targets
- 1,000+ payroll runs
- 100+ active accounts
- 20%+ guest-to-account conversion
- 4.5+ star rating (if we add reviews)
- < 2% error rate

### Key Metrics to Track
- **Engagement**: Runs per user, exports per run
- **Conversion**: Guest → Account conversion rate
- **Retention**: Users who run payroll 2+ times
- **Quality**: Error rate, support tickets
- **Performance**: Page load, computation time

---

## 17. Future Enhancements (Post-MVP)

### Month 2-3
- Payslip PDF generation
- Employee directory with photo upload
- Multi-company support for accounting firms
- Recurring payroll (auto-run monthly)
- Bank payment file generation

### Month 4-6
- Advanced tax scenarios (arrears, prorations, mid-month joins)
- Loan deductions with tax treatment
- Benefit-in-kind calculations
- Approval workflows
- Audit logs

### Month 7-12
- All 36 states + FCT templates
- Template builder UI
- API for third-party integrations
- Mobile app (React Native)
- Multi-currency support

---

## 18. Decision Log

### Key Decisions Made

1. **Guest Session**: Anonymous ID + localStorage + optional backend
   - **Date**: 2025-01-XX
   - **Rationale**: Best balance of UX, privacy, and implementation speed

2. **CSV Format**: User selection with auto-detect fallback
   - **Date**: 2025-01-XX
   - **Rationale**: User control + helpful automation

3. **File Replacement**: Confirmation dialog with save option
   - **Date**: 2025-01-XX
   - **Rationale**: Prevents data loss, simple to implement

4. **PWA in Week 1**: Yes, basic PWA
   - **Date**: 2025-01-XX
   - **Rationale**: Fast to implement, significant UX improvement

5. **Auth Strategy**: Post-success signup prompts
   - **Date**: 2025-01-XX
   - **Rationale**: No friction for urgent users, natural conversion

---

## Conclusion

This TQM document provides a comprehensive blueprint for building the Nigerian Payroll Tool MVP in 1 week while maintaining high quality standards. The key to success is:

1. **Smart defaults** that work for 80% of users
2. **Progressive enhancement** that allows power users to customize
3. **Mobile-first** design that works everywhere
4. **Guest-first** approach that removes friction
5. **Clear migration path** from guest to authenticated user

By following this plan, we can deliver a production-ready tool that serves Nigerian accountants during the critical 2026 tax reform period while building a foundation for future growth.

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Next Review**: After Week 1 launch
