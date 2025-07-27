import { Row } from "@tanstack/react-table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CoaResponse } from "@/features/coa/types";
// import { updateAccountInput, UpdateAccountInput, CoaResponse } from "./types";
// import { useUpdateAccountMutation } from "./hooks";
import { toast } from "sonner";
import { useState } from "react";
import {
  Archive,
  Binary,
  Box,
  CheckCircle2,
  Coins,
  DollarSign,
  FileText,
  Group,
  Info,
  Lock,
  Trash2,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ac } from "node_modules/@faker-js/faker/dist/airline-CLphikKp";
import { useMediaQuery } from "@/shared/hooks/use-media-query";

interface CoaViewerProps {
  row?: Row<CoaResponse> | undefined;
  companyId: string;
  onClose: () => void;
}

export const CoaViewer: React.FC<CoaViewerProps> = ({
  row,
  companyId,
  onClose,
}) => {
  const [editMode, setEditMode] = useState(false);

  if (!row) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <div>
          <p>No account selected</p>
        </div>
      </Card>
    );
  }

  const account = row.original;

  const is1024 = useMediaQuery("(max-width: 1024px)");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<any>({
    // resolver: zodResolver(updateAccountInput),
    defaultValues: account.isLocked
      ? { name: account.name }
      : {
          name: account.name,
          description: account.description || "",
          code: account.code || "",
          type: account.accountTypeId,
          currency: account.accountCurrencyId,
          is_active: account.isActive,
          is_locked: account.isLocked,
        },
  });

  // const updateMutation = useUpdateAccountMutation(companyId);

  // const onSubmit = async (data: UpdateAccountInput) => {
  //   try {
  //     const res = await updateMutation.mutateAsync({
  //       accountId: account.id,
  //       data,
  //     });
  //     if (res.success) {
  //       toast.success("Account updated successfully");
  //       setEditMode(false);
  //       onClose();
  //     } else {
  //       toast.error(res.message || "Failed to update account");
  //     }
  //   } catch (err: any) {
  //     toast.error(err?.message || "Failed to update account");
  //   }
  // };

  const handleEdit = () => {
    setEditMode(true);
    reset({
      name: account.name,
      description: account.description || "",
      code: account.code || "",
      type: account.accountTypeId,
      currency: account.accountCurrencyId,
      is_active: account.isActive,
      is_locked: account.isLocked,
    });
  };

  const wrapper = "w-full max-w-2xl mx-auto min-h-0 overflow-y-auto scrollbar-thin-2px";
  const titleSection =
    "flex justify-between items-center border-b pl-4 pr-6 py-4";
  const sectionClass = "p-4 space-y-2";
  const sectionTitleClass =
    "text-[10px] font-medium text-muted-foreground tracking-wider uppercase";
  const sectionGridClass = "grid grid-cols-2 gap-x-4 gap-y-6 w-full";
  const itemTitleClass = "text-xs text-muted-foreground pb-[2px] truncate";

  const canDelete =
    !account.isLocked &&
    account.accountTypeKey.toLowerCase() !== "ca_bank" &&
    account.canDelete &&
    !account.hasTransactions;
  const canArchive =
    account.accountTypeKey.toLowerCase() !== "ca_bank" &&
    !account.isArchived &&
    !account.isLocked;

  if (editMode) {
    return (
      <div className={wrapper}>
        <div className={titleSection}>
          <div>Account Details</div>

          <Button variant="secondary" onClick={onClose} size="sm">
            Cancel
          </Button>
        </div>

        <form>
          {/* Basic Info */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Basic Info</h3>
            <div className={sectionGridClass}>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Name</div>
                <input {...register("name")} />
              </div>
            </div>
          </div>
        </form>
      </div>
    );
  }

  if (!editMode) {
    return (
      <div className={wrapper}>
        <div className={titleSection}>
          <div>Account Details</div>
          <div className="flex gap-2">
            {account.isArchived ? (
              <Button
                // onClick={handleEdit}
                // disabled={account.isLocked}
                size="sm"
              >
                Restore
              </Button>
            ) : (
              <Button
                onClick={handleEdit}
                disabled={account.isLocked}
                size="sm"
              >
                Edit
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} size="sm">
              Close
            </Button>
          </div>
        </div>

        <div className={cn("py-6 text-sm", is1024 ? "py-4" : "")}>
          {/* Basic Info */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Basic Info</h3>
            <div className={cn(sectionGridClass, "grid-cols-[1fr_2fr]")}>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Code</div>
                <div className="flex items-center gap-1">
                  <Binary className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {account.code || <span className="text-gray-400">—</span>}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Name</div>
                <div className="line-clamp-2 text-ellipsis">{account.name}</div>
              </div>
              <div className="min-w-0 col-span-2">
                <div className={itemTitleClass}>Description</div>
                <div className="line-clamp-2 text-ellipsis">
                  {account.description || (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator className={is1024 ? "my-2" : "my-4"} />

          {/* Classification */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Classification</h3>

            <div className={cn(sectionGridClass)}>
              <div className="flex items-center gap-1 col-span-2">
                <Group className="w-4 h-4 text-muted-foreground" />
                <span>{account.parentAccountElementLabel}</span>
              </div>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Type</div>
                <div className="flex items-center gap-1 truncate">
                  <Box className="w-4 h-4 text-muted-foreground" />
                  <span>{account.accountTypeLabel}</span>
                </div>
              </div>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Element</div>
                <div className="flex items-center gap-1 truncate">
                  <Binary className="w-4 h-4 text-muted-foreground" />
                  <span>{account.accountElementLabel}</span>
                </div>
              </div>
            </div>
          </div>

          <Separator className={is1024 ? "my-2" : "my-4"} />

          {/* Currency */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Currency</h3>

            <div className={sectionGridClass}>
              <div className="min-w-0">
                <div className={itemTitleClass}>Account Currency</div>
                <div className="flex items-center gap-1">
                  <Coins className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {account.accountCurrencyCode} (
                    {account.accountCurrencySymbol})
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <div className={itemTitleClass}>Reporting Currency</div>
                <div className="flex items-center gap-1">
                  <Coins className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {account.reportingCurrencyCode} (
                    {account.reportingCurrencySymbol})
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Separator className={is1024 ? "my-2" : "my-4"} />

          {/* Status */}
          <div className={sectionClass}>
            <h3 className={sectionTitleClass}>Status</h3>
            <div className="flex flex-wrap gap-2">
              {account.isActive && (
                <Badge variant="default">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Active
                </Badge>
              )}

              {!account.isActive && (
                <Badge variant="secondary">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Inactive
                </Badge>
              )}

              {account.isLocked && (
                <Badge variant="destructive">
                  <Lock className="w-4 h-4 mr-1" /> Locked
                </Badge>
              )}

              {account.isArchived && (
                <Badge variant="outline">
                  <Archive className="w-4 h-4 mr-1" /> Archived
                </Badge>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          {(canDelete || canArchive) && (
            <>
              <Separator className={is1024 ? "my-2" : "my-4"} />

              <div className={sectionClass}>
                <h3 className={cn(sectionTitleClass, "text-destructive")}>
                  Danger Zone
                </h3>
                <div className="flex gap-4">
                  {canArchive && (
                    <Button
                      className="flex items-center gap-1"
                      variant="outline"
                    >
                      <Archive className="w-4 h-4" />
                      <span className="">Archive</span>
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      className="flex items-center gap-1"
                      variant="destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="">Delete Account</span>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
};
