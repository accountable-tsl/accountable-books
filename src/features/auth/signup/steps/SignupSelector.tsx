import { TooltipHelper } from "@/components/TooltipHelper";
import { Card } from "@/components/ui/card";
import { CompanyType } from "@/types/types";
import { COMPANY_TYPES, TOOLTIP } from "../constants/signupConstants";
import { cn } from "@/lib/utils";

export function SignupSelector({
  selectCompanyType,
  selectedType,
  error,
}: {
  selectCompanyType: (type: CompanyType) => void;
  selectedType: CompanyType | null;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-lg flex gap-1 items-center">
          Which best describes you?{" "}
          <span className="text-sm">
            <TooltipHelper
              content={TOOLTIP.companyType}
              ariaLabel="Company Type Information"
            />
          </span>
        </div>
        {error && <div className={`text-sm text-destructive`}>{error}</div>}
      </div>

      <div className="flex flex-col gap-4">
        {COMPANY_TYPES.map((c) => (
          <Card
            key={c.key}
            className={cn(
              "p-2 md:p-4 transition-colors cursor-pointer",
              selectedType === c.key
                ? "bg-primary/10 border-primary"
                : selectedType
                ? "opacity-50"
                : "hover:bg-muted/70"
            )}
            onClick={() => {
              selectCompanyType(c.key);
            }}
            aria-selected={selectedType === c.key}
            tabIndex={0}
            role="button"
          >
            <div className="text-center md:text-left">
              <div>
                {c.icon} {c.type}
              </div>

              <div className="text-sm md:text-base">{c.description}</div>
              <hr className="md:hidden opacity-70 my-1" />
              <div className="text-xs italic text-muted-foreground/80">
                Ideal for: {c.idealFor}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
