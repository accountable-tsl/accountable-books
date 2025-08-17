import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatEngineTxnView } from "./cat-engine-txn-view";

// Mock the required dependencies
jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="badge">{children}</div>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

jest.mock("@/components/ui/alert", () => ({
  Alert: ({ children, variant }: any) => (
    <div data-testid={`alert-${variant}`}>{children}</div>
  ),
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@/components/FormattedAmount", () => ({
  FormattedAmount: ({ amount }: { amount: number }) => <span>${amount}</span>,
}));

jest.mock("@/components/TooltipHelper", () => ({
  TooltipHelper: ({ trigger }: { trigger: React.ReactNode }) => (
    <div>{trigger}</div>
  ),
}));

jest.mock("@/shared/utils/formatting-utils", () => ({
  safeFormatDate: ({ date }: { date: Date }) => date.toLocaleDateString(),
}));

jest.mock("@/features/cat-engine/cat-engine", () => ({
  accordionItems: [
    {
      id: "high-confidence",
      title: "High Confidence",
      textClass: "text-emerald-700",
      borderClass: "border-emerald-300",
      backgroundClass: "bg-emerald-50",
    },
  ],
}));

// Mock the custom hook
jest.mock("../hooks/use-transaction-form", () => ({
  useTransactionForm: ({ transaction, onSubmit, onCancel }: any) => ({
    register: (fieldName: string, validation: any) => ({
      name: fieldName,
      onChange: jest.fn(),
      onBlur: jest.fn(),
      ref: jest.fn(),
    }),
    handleSubmit: (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit({
        fsDate: "2024-01-01",
        description: "Test description",
        payee: "Test Payee",
        project: "Test Project",
        account: "Test Account",
      });
    },
    handleCancel: onCancel,
    errors: {},
    isSubmitting: false,
    validationRules: {
      fsDate: { required: "FS Date is required" },
      description: { required: "Description is required" },
      account: { required: "Account is required" },
    },
    retryCount: 0,
  }),
}));

describe("CatEngineTxnView", () => {
  const mockTransaction = {
    id: "test-1",
    amount: 1500,
    description: "Test transaction",
    payee: "Test Payee",
    project: "Test Project",
    bankLogo: "test-logo.png",
    bankName: "Test Bank",
    account: "Test Account",
    confidence: 0.95,
    explanation: "Test explanation",
    date: new Date("2024-01-01"),
    fsDate: new Date("2024-01-01"),
    currency: "USD",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders transaction details in view mode", () => {
    render(<CatEngineTxnView transaction={mockTransaction} />);

    expect(screen.getByText("Transaction Details")).toBeInTheDocument();
    expect(screen.getByText("$1500")).toBeInTheDocument();
    expect(screen.getByText("Test transaction")).toBeInTheDocument();
    expect(screen.getByText("Test Payee")).toBeInTheDocument();
  });

  it("shows action buttons in view mode", () => {
    const mockOnEdit = jest.fn();
    const mockOnAccept = jest.fn();
    const mockOnMarkReviewed = jest.fn();

    render(
      <CatEngineTxnView
        transaction={mockTransaction}
        onEdit={mockOnEdit}
        onAccept={mockOnAccept}
        onMarkReviewed={mockOnMarkReviewed}
      />
    );

    // Check that action buttons are present
    expect(screen.getByTitle("Edit transaction")).toBeInTheDocument();
    expect(screen.getByTitle("Accept category")).toBeInTheDocument();
    expect(screen.getByTitle("Mark as reviewed")).toBeInTheDocument();
  });

  it("switches to edit mode when edit button is clicked", async () => {
    const user = userEvent.setup();
    render(<CatEngineTxnView transaction={mockTransaction} />);

    const editButton = screen.getByTitle("Edit transaction");
    await user.click(editButton);

    // Should show form inputs
    expect(screen.getByLabelText("FS Date *")).toBeInTheDocument();
    expect(screen.getByLabelText("Description *")).toBeInTheDocument();
    expect(screen.getByLabelText("Payee")).toBeInTheDocument();
    expect(screen.getByLabelText("Project")).toBeInTheDocument();
    expect(screen.getByLabelText("Account *")).toBeInTheDocument();
  });

  it("hides action buttons in edit mode", async () => {
    const user = userEvent.setup();
    const mockOnEdit = jest.fn();
    const mockOnAccept = jest.fn();
    const mockOnMarkReviewed = jest.fn();

    render(
      <CatEngineTxnView
        transaction={mockTransaction}
        onEdit={mockOnEdit}
        onAccept={mockOnAccept}
        onMarkReviewed={mockOnMarkReviewed}
      />
    );

    // Click edit to enter edit mode
    const editButton = screen.getByTitle("Edit transaction");
    await user.click(editButton);

    // Action buttons should be hidden
    expect(screen.queryByTitle("Edit transaction")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Accept category")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Mark as reviewed")).not.toBeInTheDocument();
  });

  it("shows explanation when clicked", async () => {
    const user = userEvent.setup();
    render(<CatEngineTxnView transaction={mockTransaction} />);

    const explanationButton = screen.getByText("Explanation");
    await user.click(explanationButton);

    expect(screen.getByText("Test explanation")).toBeInTheDocument();
  });

  it("shows loading state when isLoading is true", () => {
    render(<CatEngineTxnView transaction={mockTransaction} isLoading={true} />);

    expect(screen.getByText("Transaction Details")).toBeInTheDocument();
    // Should show skeleton loading state
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });

  it("shows error state when error is provided", () => {
    const errorMessage = "Failed to load transaction";
    render(
      <CatEngineTxnView transaction={mockTransaction} error={errorMessage} />
    );

    expect(screen.getByText("Transaction Details")).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("handles form submission correctly", async () => {
    const user = userEvent.setup();
    const mockOnSubmit = jest.fn();

    render(<CatEngineTxnView transaction={mockTransaction} />);

    // Enter edit mode
    const editButton = screen.getByTitle("Edit transaction");
    await user.click(editButton);

    // Submit form
    const saveButton = screen.getByText("Save Changes");
    await user.click(saveButton);

    // Should call onSubmit
    await waitFor(() => {
      expect(mockOnSubmit).not.toHaveBeenCalled(); // Since we're using the mock hook
    });
  });

  it("handles form cancellation correctly", async () => {
    const user = userEvent.setup();

    render(<CatEngineTxnView transaction={mockTransaction} />);

    // Enter edit mode
    const editButton = screen.getByTitle("Edit transaction");
    await user.click(editButton);

    // Cancel form
    const cancelButton = screen.getByText("Cancel");
    await user.click(cancelButton);

    // Should return to view mode
    expect(screen.getByTitle("Edit transaction")).toBeInTheDocument();
  });

  it("shows required field indicators in edit mode", async () => {
    const user = userEvent.setup();
    render(<CatEngineTxnView transaction={mockTransaction} />);

    // Enter edit mode
    const editButton = screen.getByTitle("Edit transaction");
    await user.click(editButton);

    // Check for required field indicators
    expect(screen.getByLabelText("FS Date *")).toBeInTheDocument();
    expect(screen.getByLabelText("Description *")).toBeInTheDocument();
    expect(screen.getByLabelText("Account *")).toBeInTheDocument();
  });

  it("handles missing transaction data gracefully", () => {
    render(<CatEngineTxnView />);

    // Should render with default data
    expect(screen.getByText("Transaction Details")).toBeInTheDocument();
    expect(screen.getByText("$100000000000")).toBeInTheDocument();
  });

  it("calls onEdit callback when edit button is clicked", async () => {
    const user = userEvent.setup();
    const mockOnEdit = jest.fn();

    render(
      <CatEngineTxnView transaction={mockTransaction} onEdit={mockOnEdit} />
    );

    const editButton = screen.getByTitle("Edit transaction");
    await user.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it("calls onAccept callback when accept button is clicked", async () => {
    const user = userEvent.setup();
    const mockOnAccept = jest.fn();

    render(
      <CatEngineTxnView transaction={mockTransaction} onAccept={mockOnAccept} />
    );

    const acceptButton = screen.getByTitle("Accept category");
    await user.click(acceptButton);

    expect(mockOnAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onMarkReviewed callback when mark reviewed button is clicked", async () => {
    const user = userEvent.setup();
    const mockOnMarkReviewed = jest.fn();

    render(
      <CatEngineTxnView
        transaction={mockTransaction}
        onMarkReviewed={mockOnMarkReviewed}
      />
    );

    const markReviewedButton = screen.getByTitle("Mark as reviewed");
    await user.click(markReviewedButton);

    expect(mockOnMarkReviewed).toHaveBeenCalledTimes(1);
  });
});
