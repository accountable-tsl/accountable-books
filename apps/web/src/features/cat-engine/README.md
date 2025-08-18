# Cat Engine Feature

## Overview

The Cat Engine (Categorization Engine) feature provides transaction categorization functionality with AI-powered predictions and manual review capabilities.

## Components

### CatEngineTxnView

The main transaction view component that displays transaction details with categorization information.

#### Features

- **Modular Design**: Broken down into smaller, reusable sub-components
- **TypeScript Support**: Full type safety with proper interfaces
- **Accessibility**: ARIA labels, keyboard navigation, and semantic HTML
- **Performance**: Memoized sub-components to prevent unnecessary re-renders
- **Responsive**: Adapts to different screen sizes
- **Customizable**: Accepts props for data and styling
- **Edit Mode**: Inline form editing with React Hook Form
- **Action Buttons**: Edit, Accept Category, and Mark as Reviewed functionality
- **Smooth Transitions**: Improved animations and transitions

#### Props

```typescript
interface CatEngineTxnViewProps {
  transaction?: TransactionData; // Transaction data to display
  accordionItemId?: string; // ID for styling based on confidence level
  className?: string; // Additional CSS classes
  onEdit?: () => void; // Edit button callback
  onAccept?: () => void; // Accept category callback
  onMarkReviewed?: () => void; // Mark as reviewed callback
  isEditable?: boolean; // Whether the component is in edit mode
}
```

#### Sub-components

- `TransactionHeader`: Simplified header with title and badge
- `TransactionView`: Main view component for display mode
- `TransactionActions`: Centralized action buttons at bottom
- `JournalEntriesSection`: Journal entries display
- `TransactionForm`: Form component for edit mode
- `AmountDisplay`: Displays transaction amount with color coding
- `BankLogo`: Bank logo with fallback icon
- `DateField`: Date display with tooltips
- `TruncatedText`: Text with truncation and tooltip support
- `CategoryDisplay`: Category/account display with confidence
- `ExplanationSection`: Collapsible explanation section with smooth transitions

## File Structure

```
cat-engine/
├── components/
│   ├── cat-engine-txn-view.tsx    # Main transaction view
│   ├── cat-engine-toolbar.tsx     # Toolbar component
│   ├── cat-engine-adv-filter.tsx  # Advanced filters
│   ├── error-boundary.tsx         # Error boundary component
│   └── loading-state.tsx          # Loading and skeleton components
├── hooks/
│   └── use-transaction-form.ts    # Custom form hook
├── types/
│   └── index.ts                   # TypeScript interfaces
├── constants/
│   └── index.ts                   # Configuration constants
├── config/
│   └── table-columns.tsx          # Table column definitions
└── cat-engine.tsx                 # Main feature component
```

## Usage Example

```tsx
import { CatEngineTxnView } from '@/features/cat-engine/components/cat-engine-txn-view';

const transaction = {
  id: 'tx-123',
  amount: 1500.0,
  description: 'Office supplies purchase',
  payee: 'Office Depot',
  project: 'Marketing Campaign',
  bankLogo: 'https://example.com/logo.png',
  bankName: 'Chase Bank',
  account: 'Office Expenses',
  confidence: 0.95,
  explanation: 'AI detected office supplies based on vendor and amount',
  date: new Date(),
  fsDate: new Date(),
  currency: 'USD',
};

<CatEngineTxnView
  transaction={transaction}
  accordionItemId="high-confidence"
  onEdit={() => console.log('Edit clicked')}
  onAccept={() => console.log('Accept clicked')}
  onMarkReviewed={() => console.log('Mark reviewed clicked')}
/>;
```

## Edit Mode

The component supports inline editing with the following features:

### Editable Fields

- **FS Date**: Date recorded in the ledger
- **Description**: Transaction description
- **Payee**: Transaction payee/vendor
- **Project**: Associated project
- **Account**: Chart of accounts category

### Read-Only Fields

- **Amount**: Transaction amount (cannot be changed)
- **Date**: Bank transaction date (cannot be changed)
- **Bank Info**: Bank logo and name (cannot be changed)
- **Confidence**: AI confidence score (cannot be changed)

### Form Features

- **React Hook Form**: For form state management and validation
- **Validation**: Comprehensive validation with custom error messages
- **Save/Cancel**: Form submission and cancellation handling
- **Auto-populate**: Form fields pre-populated with current values
- **Auto-save**: Configurable auto-save functionality
- **Retry Logic**: Automatic retry for failed API calls
- **Form State Management**: Custom hook for complex form logic
- **Error Handling**: Graceful error handling with user feedback

## Production Features

- [x] **Error Boundaries**: Graceful error handling with recovery
- [x] **Loading States**: Skeleton loading and loading indicators
- [x] **Form Validation**: Comprehensive validation with custom rules
- [x] **Retry Logic**: Automatic retry for network failures
- [x] **Auto-save**: Configurable auto-save functionality
- [x] **Accessibility**: Full ARIA support and keyboard navigation
- [x] **Type Safety**: Complete TypeScript coverage
- [x] **Performance**: Memoized components and optimized re-renders
- [x] **Testing**: Comprehensive test coverage
- [x] **Error Handling**: User-friendly error messages and recovery

## Future Enhancements

- [ ] Bulk operations support
- [ ] Real-time updates
- [ ] Keyboard shortcuts
- [ ] Drag and drop functionality
- [ ] Advanced form validation
- [ ] Undo/redo functionality
- [ ] Offline support
- [ ] Progressive Web App features

## Performance Optimizations

- All sub-components are memoized with `React.memo`
- Constants are centralized to prevent recreation
- Lazy loading for images
- Efficient re-rendering with proper dependency arrays
- Custom hooks for form state management
- Debounced form validation
- Auto-save functionality (configurable)
- Retry logic for failed API calls
- **Memoized calculations**: `curr` and `isHighConfidence` computed once and cached
- **Logical component separation**: Clear separation of concerns
- **Eliminated redundancy**: No repeated calculations or prop drilling

## Accessibility Features

- ARIA labels for screen readers
- Keyboard navigation support
- Semantic HTML structure
- Proper focus management
- Color contrast compliance
- Screen reader friendly content
- Form field associations with error messages
- Required field indicators
- Error boundary for graceful error handling
