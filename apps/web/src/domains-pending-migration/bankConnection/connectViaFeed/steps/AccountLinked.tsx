import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { routes } from '@/shared/routes/routes';
import { maskDigits } from '@/shared/utils/formatting-utils';
import { BadgeAlert, Check, TriangleAlert, Waypoints } from 'lucide-react';
import { useNavigate } from 'react-router';

import type { ConnectionResponse } from '../types';

export const AccountLinked = ({
  connections,
  handleDone,
  reset,
}: {
  connections: ConnectionResponse[];
  handleDone?: () => void;
  reset?: () => void;
}) => {
  const [selections, setSelections] = useState<Record<string, string>>({});

  const navigate = useNavigate();

  // Group connections by connection status 3 groups - connected, new_account_created together, user_action_required, error
  const grouped = connections.reduce(
    (acc, conn) => {
      const status = conn.connectionStatus;
      if (status === 'connected' || status === 'new_account_created') {
        acc.connected.push(conn);
      } else if (status === 'needs_user_confirmation') {
        acc.userActionRequired.push(conn);
      } else {
        acc.error.push(conn);
      }
      return acc;
    },
    {
      connected: [] as ConnectionResponse[],
      userActionRequired: [] as ConnectionResponse[],
      error: [] as ConnectionResponse[],
    },
  );
  // For each connection that has userActionRequired set to true
  const preparePayload = () => {
    return grouped.userActionRequired.map((c) => {
      const chosen = selections[c.connectionDetails.connectionId];
      return {
        connectionId: c.connectionDetails.connectionId,
        chosenBankAccountId: chosen, // could be 'new' or an actual bankAccountId
      };
    });
  };

  //   Make sure users select something for each required action
  const allSelected = grouped.userActionRequired.every(
    (c) => selections[c.connectionDetails.connectionId],
  );

  const handleUpdateConnection = () => {
    const payload = preparePayload();
    console.log(payload);

    // Send payload to backend
  };

  const handleSuccess = () => {
    // If handleDone is provided, use it, otherwise navigate to categorization engine
    if (handleDone) {
      handleDone?.();
    } else {
      navigate(routes.accounting.catEngine.relativePath);
    }
  };

  // Do all accounts in connections have userActionRequired set to false && connectionStatus set to connected or new_account_created? Render Success
  // Do any accounts have userActionRequired set to true? Render Needs Confirmation
  const renderSuccess = () => (
    <>
      <div className="flex h-full flex-col gap-4 py-4">
        <div className="flex-shrink-0 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Waypoints className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold">Account Linked!</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl text-sm">
            Link other checking, savings, or credit accounts used for your
            business or continue later. <br /> If you've added all your business
            accounts, you're all done!
          </p>
        </div>

        <div className="scrollbar-thin-2px flex min-h-[15rem] w-full flex-wrap items-stretch justify-center gap-6 overflow-y-auto py-2">
          {grouped.userActionRequired.length > 0 && (
            <div className="flex w-full flex-col gap-3 rounded-md border border-yellow-500/50 p-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 flex-col">
                  <span>
                    We found bank accounts in your records that might match the
                    one you just connected
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Please select the correct account from the list below, or
                    choose “This is a new account” if none match.
                  </span>
                </div>
                <BadgeAlert className="h-8 w-8 text-yellow-600" />
              </div>
              <div>
                <div className="bg-muted mb-2 grid grid-cols-2 items-center gap-3 border-b p-2 font-medium">
                  <div>Account Linked</div>
                  <div>Bank Account</div>
                </div>
                <form className="flex flex-col gap-2">
                  {grouped.userActionRequired.map((c) => (
                    <div
                      key={c.connectionDetails.connectionId}
                      className="grid grid-cols-2 items-center gap-3 px-2"
                    >
                      <div>
                        {c.accountDetails?.bankName} |{' '}
                        {c.accountDetails?.accountName}{' '}
                        {c.accountDetails?.accountNumber
                          ? maskDigits(c.accountDetails?.accountNumber || '')
                          : ''}
                      </div>
                      <Select
                        value={
                          selections[c.connectionDetails.connectionId] || ''
                        }
                        onValueChange={(val) => {
                          setSelections((prev) => ({
                            ...prev,
                            [c.connectionDetails.connectionId]: val,
                          }));
                        }}
                      >
                        <SelectTrigger className="w-full max-w-full flex-1">
                          <SelectValue placeholder="Select the correct account" />
                        </SelectTrigger>
                        <SelectContent>
                          {c.suggestedBankAccountMatches.map((m, i) => (
                            <SelectItem key={i} value={m.bankAccountId}>
                              {m.bankName} | {m.accountName} {m.accountNumber}
                            </SelectItem>
                          ))}
                          <SelectItem value="new">
                            This is a new bank account
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </form>
              </div>
            </div>
          )}
          {grouped.connected.length > 0 && (
            <div className="flex min-h-0 w-full min-w-[18rem] flex-1 flex-col items-center justify-center">
              <div className="flex h-full flex-col overflow-clip rounded-sm border border-green-500/50">
                <div className="bg-muted flex justify-between px-4 py-3">
                  <div className="font-semibold">Connected</div>
                  <div className="flex items-center gap-2 text-green-500">
                    <span className="font-medium">Linked</span>
                    <Check size={16} strokeWidth={4} />
                  </div>
                </div>
                <div className="flex-1">
                  <Table>
                    <TableBody>
                      {grouped.connected.map((c) => (
                        <TableRow
                          className="text-[0.85rem]"
                          key={c.connectionDetails.connectionId}
                        >
                          <TableCell className="px-4 py-3">
                            {c.accountDetails?.bankName}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            {c.accountDetails?.accountName}{' '}
                            {maskDigits(c.accountDetails?.accountNumber || '')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="bg-muted/50 w-full cursor-not-allowed border-t border-t-green-500/50 p-2 text-center opacity-50">
                  Edit account types
                </div>
              </div>
              <p className="text-muted-foreground mt-2 text-center text-xs">
                {grouped.connected.length} account
                {grouped.connected.length > 1 ? 's' : ''} connected successfully
              </p>
            </div>
          )}
          {grouped.error.length > 0 && (
            <div className="flex min-h-0 w-full min-w-[18rem] flex-1 flex-col items-center justify-center">
              <div className="border-destructive/50 flex h-full w-full flex-col overflow-clip rounded-sm border">
                <div className="bg-muted flex justify-between px-4 py-3">
                  <div className="font-semibold">Error</div>
                  <div className="flex items-center gap-2 text-red-500">
                    <span className="font-medium">Error</span>
                    <TriangleAlert size={16} strokeWidth={4} />
                  </div>
                </div>

                <Table>
                  <TableBody>
                    {grouped.error.map((c) => (
                      <React.Fragment key={c.connectionDetails.connectionId}>
                        <TableRow>
                          <TableCell
                            className="text-destructive max-w-64 px-4 py-3 text-center text-[0.8rem] break-words whitespace-normal"
                            colSpan={2}
                          >
                            {c.message}
                          </TableCell>
                        </TableRow>
                        <TableRow className="text-[0.85rem]">
                          <TableCell className="px-4 py-3">
                            {c.accountDetails?.bankName}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            {c.accountDetails?.accountName}{' '}
                            {maskDigits(c.accountDetails?.accountNumber || '')}
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
                {/* <div className="p-2 bg-muted/50 opacity-50 border-t border-t-destructive/50 w-full text-center cursor-not-allowed">
                Edit account types
              </div> */}
              </div>
              <p className="text-muted-foreground mt-2 text-center text-xs">
                Error connecting {grouped.error.length} account
                {grouped.error.length > 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 justify-between gap-2">
          <Button
            variant="outline"
            disabled={
              grouped.error.length > 0 || grouped.userActionRequired.length > 0
            }
            onClick={reset}
          >
            Link another account
          </Button>

          {grouped.error.length ? (
            <Button onClick={reset}>Try again</Button>
          ) : grouped.userActionRequired.length ? (
            <Button disabled={!allSelected} onClick={handleUpdateConnection}>
              Update Connection
            </Button>
          ) : (
            <Button onClick={handleSuccess}>Done for now</Button>
          )}
        </div>
      </div>
    </>
  );
  // const renderAlreadyLinked = () => (
  //   <>
  //     <></>
  //   </>
  // );
  // const renderNeedsConfirmation = () => (
  //   <>
  //     <></>
  //   </>
  // );
  return (
    <>
      {/* Account Linked Account Link Successful? Show Linked page and let user
      choose whether account is business or personal (personal by default for
      ind, business by default for business and acc firms) Already Already
      Linked? Show Account Already Linked Needs user to confirm. list of accounts connections on the left, list of accounts suggested on the right dropdown? */}
      {renderSuccess()}
    </>
  );
};

AccountLinked.whyDidYouRender = true;
