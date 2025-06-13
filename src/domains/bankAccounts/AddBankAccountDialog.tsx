import { useIsMobile } from "@/shared/hooks/use-mobile";
import { AddBankAccountDialogProps } from "./types";
import AddBankAccount from "@/domains/bankAccounts/AddBankAccount";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AddBankAccountDialog({
  open,
  onOpenChange,
  onSuccess,
  onCancel,
  overlayClassName,
  showHeader = false,
}: AddBankAccountDialogProps) {
  const isMobile = useIsMobile();
  const handleSuccess = onSuccess ?? (() => onOpenChange(false));

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className={showHeader ? "" : "sr-only"}>
            <DrawerTitle>Add Bank Account</DrawerTitle>
          </DrawerHeader>
          <AddBankAccount onSuccess={handleSuccess} onCancel={onCancel} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={overlayClassName}>
        <DialogHeader className={showHeader ? "" : "sr-only"}>
          <DialogTitle>Add Bank Account</DialogTitle>
        </DialogHeader>
        <AddBankAccount onSuccess={handleSuccess} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
}
