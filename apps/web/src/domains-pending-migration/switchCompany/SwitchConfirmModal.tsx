import { Building2Icon, BuildingIcon, UserIcon } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AuthCompanyContext } from '@/modules/auth/types';

interface SwitchConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fromCompany: AuthCompanyContext | null;
  toCompany: AuthCompanyContext | null;
  isLoading?: boolean;
}

export function SwitchConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  fromCompany,
  toCompany,
  isLoading = false,
}: SwitchConfirmModalProps) {
  const [rememberChoice, setRememberChoice] = useState(false);

  const getCompanyIcon = (companyType: string) => {
    switch (companyType) {
      case 'accounting_firm':
        return <Building2Icon className="h-5 w-5" />;
      case 'business':
        return <BuildingIcon className="h-5 w-5" />;
      case 'individual':
        return <UserIcon className="h-5 w-5" />;
      default:
        return <BuildingIcon className="h-5 w-5" />;
    }
  };

  const getCompanyName = (company: AuthCompanyContext | null) => {
    if (!company) return 'Unknown Company';
    return (
      company.displayName || company.legalName || company.id.slice(0, 8) + '...'
    );
  };

  const handleConfirm = () => {
    // TODO: Store remember choice in localStorage if needed
    if (rememberChoice) {
      localStorage.setItem('autoSwitchCompanies', 'true');
    }
    onConfirm();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleConfirm();
    } else if (e.key === 'Escape' && !isLoading) {
      onClose();
    }
  };

  if (!fromCompany || !toCompany) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Switch Company?</DialogTitle>
          <DialogDescription>
            You're about to switch from your current company to a different
            company.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* From Company */}
          <div className="bg-muted/50 flex items-center gap-3 rounded-lg border p-3">
            <div className="text-muted-foreground">
              {getCompanyIcon(fromCompany.companyType)}
            </div>
            <div className="flex-1">
              <div className="text-muted-foreground text-sm font-medium">
                From:
              </div>
              <div className="font-semibold">{getCompanyName(fromCompany)}</div>
              {fromCompany.isDemoCompany && (
                <div className="text-xs text-orange-600">Demo Company</div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="text-muted-foreground">↓</div>
          </div>

          {/* To Company */}
          <div className="bg-primary/5 flex items-center gap-3 rounded-lg border p-3">
            <div className="text-primary">
              {getCompanyIcon(toCompany.companyType)}
            </div>
            <div className="flex-1">
              <div className="text-muted-foreground text-sm font-medium">
                To:
              </div>
              <div className="font-semibold">{getCompanyName(toCompany)}</div>
              {toCompany.isDemoCompany && (
                <div className="text-xs text-orange-600">Demo Company</div>
              )}
            </div>
          </div>

          {/* Remember choice */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="remember"
              checked={rememberChoice}
              onCheckedChange={(checked) => setRememberChoice(checked === true)}
              disabled={isLoading}
            />
            <label
              htmlFor="remember"
              className="text-muted-foreground cursor-pointer text-sm"
            >
              Don't ask again for this session
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Switching...' : 'Switch Company'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
