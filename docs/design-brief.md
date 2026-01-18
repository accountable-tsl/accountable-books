# Design Brief: Accountable Payroll (MVP)

> **To the Designer:** We want you to feel free to explore. This document defines the _problem_ and the _user goals_, not the exact pixel solution. We need your creativity to make "Payroll" feel fast, safe, and surprisingly delightful.

## The Pitch

Imagine if running payroll tailored for the new 2026 Nigerian tax laws was as easy as pasting a list into a smart spreadsheet. No clunky "enterprise software" signup forms, no "contact sales". Just **Open -> Import -> Export**.

We are building a **free, guest-mode payroll calculator** that works instantly.

## The Vibe

- **Fast**: It should feel lightweight, like a calculator app, not a heavy database.
- **Trustworthy**: It handles money and taxes. It should feel precise (monospaced fonts for numbers?) but modern (clean whitespace).
- **Friendly**: Taxes are stressful. The tool should be calming. "We got you."

## The User

**The Nigerian Accountant (or Small Business Owner).**

- **Context**: It's January 2026. New tax laws just dropped. They are panicking. They need to run payroll _now_ and don't want to learn complex software.
- **Goal**: Get the "Payroll Excel" and "Tax Schedules" downloaded so they can pay staff and the government.

## Key Screens / Flows

### 1. Landing Page (The Hook)

- **Goal**: Explain the value prop ("Compliant 2026 Payroll. Free. No Signup needed to start.") and get them into the app immediately.
- **Hero**: A big "Start a Payroll Run" button. Maybe a "Drop your Employee CSV here" zone right on the landing page?

### 2. The Setup Wizard (Quick Configuration)

- **Inputs**:
  - Month/Year (e.g., January 2026)
  - Company Name
  - _That's it._ (Keep it minimal).

### 3. The "Smart Grid" (The Core Experience)

- **Challenge**: This is where they spend 80% of their time. It needs to handle data entry (Employees, Salaries, Bonuses) efficiently.
- **Feel**: Like a better Excel.
  - **Columns**: Name, Basic Pay, Housing, Transport, Pension (%), Tax (Calculated).
  - **Interactions**:
    - Inline editing (click a cell, type numbers).
    - **Real-time updates**: As you change "Basic Pay", the "Tax" column should update instantly.
    - **Overrides**: If the system calculates "N50,000" tax, but the accountant knows it should be "N45,000", let them overwrite it (maybe highlight the cell to show it's manually set?).
  - **Mobile Challenge**: How do we make this usable on a phone? (Maybe a Card view for each employee instead of a wide table?)

### 4. Review & Export (The Reward)

- **Summary**: "You are paying N5.5M total. N600k to Government." (Big, reassuring numbers).
- **Downloads**: Clear, satisfying buttons for the deliverables:
  - "Download Payroll Excel"
  - "Download Pension Schedule"
  - "Download Tax Schedule (Lagos)"
  - _Upsell_: "Save this run for next month?" (This is where we catch them).

## Technical Constraints (FYI)

- **PWA**: It will be installed on phones.
- **Guest Mode**: Remember, we don't know who they are until the very end.

## Success for Design

If a user lands on the page and has their exported Excel file open in **less than 3 minutes**, we have won.
