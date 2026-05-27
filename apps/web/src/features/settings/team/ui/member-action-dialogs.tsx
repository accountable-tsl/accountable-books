import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { getRoleLabel } from '../lib/presenters';

import type { TeamMember, TeamMemberRole } from '../model/use-team-settings';

type MemberActionDialogsProps = {
  editRoleDialogMember: TeamMember | null;
  setEditRoleDialogMember: (member: TeamMember | null) => void;
  editRoleValue: TeamMemberRole;
  setEditRoleValue: (role: TeamMemberRole) => void;
  editableRoleOptions: TeamMemberRole[];
  editRoleSaveDisabled: boolean;
  updateTeamMemberRolePending: boolean;
  onConfirmEditRole: () => Promise<void> | void;
  removeMemberDialogMember: TeamMember | null;
  setRemoveMemberDialogMember: (member: TeamMember | null) => void;
  removeTeamMemberPending: boolean;
  onConfirmRemoveMember: () => Promise<void> | void;
  revokeDialogMember: TeamMember | null;
  setRevokeDialogMember: (member: TeamMember | null) => void;
  revokeTeamInvitePending: boolean;
  onConfirmRevokeInvite: () => Promise<void> | void;
};

function makePendingSafeOpenChange<T>(
  isPending: boolean,
  setter: (value: T | null) => void,
) {
  return (open: boolean) => {
    if (!open && isPending) {
      return;
    }
    if (!open) {
      setter(null);
    }
  };
}

export function MemberActionDialogs({
  editRoleDialogMember,
  setEditRoleDialogMember,
  editRoleValue,
  setEditRoleValue,
  editableRoleOptions,
  editRoleSaveDisabled,
  updateTeamMemberRolePending,
  onConfirmEditRole,
  removeMemberDialogMember,
  setRemoveMemberDialogMember,
  removeTeamMemberPending,
  onConfirmRemoveMember,
  revokeDialogMember,
  setRevokeDialogMember,
  revokeTeamInvitePending,
  onConfirmRevokeInvite,
}: MemberActionDialogsProps) {
  return (
    <>
      <Dialog
        open={Boolean(editRoleDialogMember)}
        onOpenChange={makePendingSafeOpenChange(
          updateTeamMemberRolePending,
          setEditRoleDialogMember,
        )}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit member role</DialogTitle>
            <DialogDescription>
              {editRoleDialogMember
                ? `Update role for ${editRoleDialogMember.email}.`
                : 'Update the selected member role.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-medium">Role</p>
            <Select
              value={editRoleValue}
              onValueChange={(value) =>
                setEditRoleValue(value as TeamMemberRole)
              }
              disabled={updateTeamMemberRolePending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {editableRoleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {getRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditRoleDialogMember(null)}
              disabled={updateTeamMemberRolePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void onConfirmEditRole();
              }}
              disabled={editRoleSaveDisabled}
            >
              {updateTeamMemberRolePending ? 'Saving role...' : 'Save role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(removeMemberDialogMember)}
        onOpenChange={makePendingSafeOpenChange(
          removeTeamMemberPending,
          setRemoveMemberDialogMember,
        )}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeMemberDialogMember
                ? `This will remove ${removeMemberDialogMember.email} from this workspace.`
                : 'This will remove this member from this workspace.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeTeamMemberPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeTeamMemberPending}
              onClick={() => {
                void onConfirmRemoveMember();
              }}
            >
              {removeTeamMemberPending ? 'Removing member...' : 'Remove member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(revokeDialogMember)}
        onOpenChange={makePendingSafeOpenChange(
          revokeTeamInvitePending,
          setRevokeDialogMember,
        )}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invite?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeDialogMember
                ? `This will cancel the pending invite for ${revokeDialogMember.email}.`
                : 'This will cancel the pending invite.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeTeamInvitePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokeTeamInvitePending}
              onClick={() => {
                void onConfirmRevokeInvite();
              }}
            >
              {revokeTeamInvitePending ? 'Revoking invite...' : 'Revoke invite'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
