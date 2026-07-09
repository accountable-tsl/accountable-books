import type { AiDomainKey } from '@/modules/ai/keys';
import type {
  AiCapabilityUI,
  AiLauncherPlacement,
  AiMessage,
} from '@/modules/ai/runtime/types';
import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  AlignCenter,
  AlignRight,
  Loader,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';

import {
  getEmptyStateMessage,
  getMessageAttribution,
  SUGGESTION_MASK_STYLE,
} from './ai-command-bar.utils';

export const SUGGESTION_CHIP =
  'shrink-0 rounded-xl border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:bg-background hover:text-foreground';

export const COMPACT_ACTION_BTN =
  'flex size-7 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur-md transition-colors hover:bg-background hover:text-foreground';

type CapabilitySuggestionsProps = {
  capabilities: AiCapabilityUI[];
  onSelect: (capability: AiCapabilityUI) => void;
  layout: 'scroll' | 'wrap';
  className?: string;
  buttonRowClassName?: string;
};

export function CapabilitySuggestions({
  capabilities,
  onSelect,
  layout,
  className,
  buttonRowClassName = 'flex gap-1.5',
}: Readonly<CapabilitySuggestionsProps>) {
  if (capabilities.length === 0) return null;

  const buttons = capabilities.slice(0, 6).map((cap) => (
    <button
      key={cap.capabilityId}
      type="button"
      className={SUGGESTION_CHIP}
      onClick={() => onSelect(cap)}
      title={cap.description}
    >
      {cap.label}
    </button>
  ));

  if (layout === 'wrap') {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>{buttons}</div>
    );
  }

  return (
    <div
      className={cn('no-scrollbar overflow-x-auto', className)}
      style={SUGGESTION_MASK_STYLE}
    >
      <div className={buttonRowClassName}>{buttons}</div>
    </div>
  );
}

type LauncherPlacementPickerProps = {
  launcherPlacement: AiLauncherPlacement;
  onPlacementChange: (placement: AiLauncherPlacement) => void;
};

export function LauncherPlacementPicker({
  launcherPlacement,
  onPlacementChange,
}: Readonly<LauncherPlacementPickerProps>) {
  return (
    <div className="text-muted-foreground flex flex-col gap-1 px-2 py-1.5 text-xs">
      <div className="text-[10px] uppercase">Launcher</div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onPlacementChange('bottom-center')}
          className={cn(
            'flex flex-1 items-center gap-1 rounded-sm p-1 px-2 transition-colors',
            launcherPlacement === 'bottom-center'
              ? 'bg-blue-500/10 text-blue-500'
              : 'bg-muted hover:bg-muted/80',
          )}
        >
          <AlignCenter className="size-3" />
          <span>Center</span>
        </button>
        <button
          type="button"
          onClick={() => onPlacementChange('bottom-right')}
          className={cn(
            'flex flex-1 items-center gap-1 rounded-sm p-1 px-2 transition-colors',
            launcherPlacement === 'bottom-right'
              ? 'bg-blue-500/10 text-blue-500'
              : 'bg-muted hover:bg-muted/80',
          )}
        >
          <AlignRight className="size-3" />
          <span>Right</span>
        </button>
      </div>
    </div>
  );
}

type AiMoreActionsMenuProps = {
  trigger: ReactNode;
  onNewChat: () => void;
  launcherPlacement: AiLauncherPlacement;
  onPlacementChange: (placement: AiLauncherPlacement) => void;
  menuSide?: 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  contentClassName?: string;
};

export function AiMoreActionsMenu({
  trigger,
  onNewChat,
  launcherPlacement,
  onPlacementChange,
  menuSide,
  align = 'end',
  contentClassName = 'z-150 w-48',
}: Readonly<AiMoreActionsMenuProps>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        {...(menuSide ? { side: menuSide } : {})}
        sideOffset={10}
        className={contentClassName}
      >
        <DropdownMenuItem onClick={onNewChat}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          New Chat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <LauncherPlacementPicker
          launcherPlacement={launcherPlacement}
          onPlacementChange={onPlacementChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type AiMessageListProps = {
  visibleMessages: AiMessage[];
  messagesCount: number;
  messageDomainFilter: AiDomainKey | null;
  hasCapabilities: boolean;
  getDomainLabel: (domain?: AiDomainKey) => string | null;
};

export function AiMessageList({
  visibleMessages,
  messagesCount,
  messageDomainFilter,
  hasCapabilities,
  getDomainLabel,
}: Readonly<AiMessageListProps>) {
  if (visibleMessages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="text-muted-foreground max-w-[80%] text-sm">
          {getEmptyStateMessage({
            hasFilteredView: messagesCount > 0 && Boolean(messageDomainFilter),
            hasCapabilities,
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {visibleMessages.map((m) => {
        const domainLabel = getDomainLabel(m.meta?.domain);
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            key={m.id}
            className={cn(
              'mb-4 last:mb-0',
              m.role === 'user' ? 'ml-8' : 'mr-8',
            )}
          >
            <div
              className={cn(
                'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-primary/85 dark:bg-primary/50 text-white shadow-md'
                  : 'bg-muted text-foreground',
              )}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
            <div
              className={cn(
                'text-muted-foreground mt-1 text-[10px]',
                m.role === 'user' ? 'text-right' : 'text-left',
              )}
            >
              {getMessageAttribution(m.role, domainLabel)}
            </div>
          </motion.div>
        );
      })}
    </>
  );
}

type AiDomainChipsProps = {
  activeDomain: AiDomainKey | null;
  domains: Array<{ domain: AiDomainKey; label: string; count: number }>;
  onSelectAll: () => void;
  onSelectDomain: (domain: AiDomainKey) => void;
  showMobileActions: boolean;
  onNewChat: () => void;
  onClose: () => void;
};

export function AiDomainChips({
  activeDomain,
  domains,
  onSelectAll,
  onSelectDomain,
  showMobileActions,
  onNewChat,
  onClose,
}: Readonly<AiDomainChipsProps>) {
  return (
    <div className="bg-muted/20 flex flex-wrap items-center gap-1.5 border-b border-white/10 px-4 py-2">
      <div className="from-primary dark:from-primary/10 mr-1 flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-tr to-blue-500 text-[10px] font-bold text-white shadow-sm">
        <Loader className="size-3" />
      </div>
      <button
        type="button"
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
          activeDomain === null
            ? 'border-blue-500/50 bg-blue-500/10 text-blue-500'
            : 'text-muted-foreground hover:bg-muted/50 border-transparent bg-transparent',
        )}
        onClick={onSelectAll}
      >
        All
      </button>
      {domains.map((d) => (
        <button
          key={d.domain}
          type="button"
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
            activeDomain === d.domain
              ? 'border-blue-500/50 bg-blue-500/10 text-blue-500'
              : 'text-muted-foreground hover:bg-muted/50 border-transparent bg-transparent',
          )}
          onClick={() => onSelectDomain(d.domain)}
          title={`${d.count} capabilities`}
        >
          {d.label}
        </button>
      ))}
      {showMobileActions && (
        <div className="ml-auto flex items-center gap-1 sm:hidden">
          <button
            type="button"
            onClick={onNewChat}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
            title="New chat"
          >
            <MessageSquarePlus className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
