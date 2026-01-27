# Payroll Glossary

Here are simple definitions for the core concepts in the Payroll system.

### Payroll Run

A distinct payroll event, usually for a specific month (e.g., "January 2026 Payroll"). It contains a list of all employees being paid in that period and their calculated amounts. Use this to track history.

### Payroll Run Item

A single row in a Payroll Run. It represents **one employee's pay for that specific month**.

- **Note:** It is a _snapshot_. Changing a value here (like a one-off bonus) only affects _this_ run, not the employee's permanent record.

### Employee Record

The permanent "master" data for an employee. It includes unchanging details like their Name, Role, Bank Details, and base Salary.

- **Stored in:** Employee Directory.
- **Usage:** When you start a new Payroll Run, the system copies this data to create the _Payroll Run Items_.

### Employee Directory

The central database of all Employee Records. Think of it as your "address book" for staff.

### Company Settings

Global defaults for your organization, such as your Company Name, Default Tax State (e.g., Lagos), and Salary Breakdown policy (e.g., whether you split salary into Basic/Housing/Transport).
