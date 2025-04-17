import { Card } from "@/components/ui/card";
import { CompanyType } from "@/types/types";
import { CircleHelp } from "lucide-react";

export function SignupSelector({
  onSelect,
  selectedType,
  error,
}: {
  onSelect: (type: CompanyType) => void;
  selectedType: string | null;
  error?: string;
}) {
  const userCategories: {
    key: CompanyType;
    type: string;
    description: string;
    idealFor: string;
    icon: string;
  }[] = [
    {
      key: "business",
      type: "Business",
      description: "I provide accounting services to clients",
      idealFor: "Founders, Business Owners",
      icon: "🏢",
    },
    {
      key: "accounting_firm",
      type: "Accounting Firm",
      description: "I provide accounting services to clients",
      idealFor: "Accounting firms, freelance bookkeepers",
      icon: "🧑‍💻",
    },
    {
      key: "individual",
      type: "Individual",
      description: "I want to track my personal expenses",
      idealFor: "Individuals, Students, Personal Finance Enthusiasts",
      icon: "👤",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-lg flex gap-1 items-center">
          Which best describes you?{" "}
          <span className="text-sm">
            <CircleHelp size={12} />
          </span>
        </div>
        <div className={`text-sm text-destructive ${!error && "invisible"}`}>
          {error}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {userCategories.map((c, i) => (
          <Card
            key={i}
            className={`p-4 cursor-pointer hover:bg-muted/70 transition-colors ${
              selectedType === c.key
                ? "bg-primary/10 border-primary"
                : "hover:bg-muted/70"
            }`}
            onClick={() => onSelect(c.key)}
          >
            <div>
              <div>
                {c.icon} {c.type}
              </div>

              <div>{c.description}</div>
              <div className="text-xs italic text-muted-foreground">
                Ideal for: {c.idealFor}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
