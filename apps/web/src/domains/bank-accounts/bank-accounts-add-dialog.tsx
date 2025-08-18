import { useIsMobile } from '@/shared/hooks/use-media-query';
import { AddBankAccountDialogProps } from './types';
import AddBankAccount from '@/domains/bank-accounts/bank-accounts-add';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
        <DrawerContent overlayClassName={overlayClassName} className="sm:max-w-md max-w-md">
          <DrawerHeader className={showHeader ? '' : 'sr-only'}>
            <DrawerTitle>Add Bank Account</DrawerTitle>
            <DrawerDescription className="text-muted-foreground text-sm">
              Add a new bank account
            </DrawerDescription>
          </DrawerHeader>
          <AddBankAccount onSuccess={handleSuccess} onCancel={onCancel} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={overlayClassName}>
        <DialogHeader className={showHeader ? '' : 'sr-only'}>
          <DialogTitle>Add Bank Account</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Add a new bank account
          </DialogDescription>
        </DialogHeader>
        <AddBankAccount onSuccess={handleSuccess} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
}
