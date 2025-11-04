/**
 * Write a function that fetches transactions to display on the categorization engine page
 * We fetch bank transactions
 * - For uncategorized, we fetch them as they are
 * - For suggested & categorized, i.e there's a prediction of how they should be categorized
 * - We get that prediction or the categorization and show the entries
 *
 * - Only one leg of the transaction will be shown and it will not be the bank leg
 * - Example: Transaction 500 has been posted/suggested to ledger CR Bank Account COA, Debit Bank Charges COA
 * - We only show the bank charges leg
 * - Another scenario: If the transaction is yet to be posted, we just show the bank transaction line
 * - Another scenario: If the transaction was split, there'll be one bank leg and two other accounts, we'll show those two
 *
 * - We need to understand the manual and auto categorization flow properly to be able to complete this
 * - We should probably use a materialized view (or view) for this and refresh as needed
 */
