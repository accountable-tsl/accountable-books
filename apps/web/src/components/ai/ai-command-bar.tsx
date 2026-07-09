import type { ReactNode } from 'react';
import {
  AiDomainChips,
  AiMessageList,
  AiMoreActionsMenu,
  CapabilitySuggestions,
  COMPACT_ACTION_BTN,
  LauncherPlacementPicker,
} from '@/components/ai/ai-command-bar-parts';
import { domainLabelFallback } from '@/components/ai/ai-command-bar.utils';
import { useAiCommandBar } from '@/components/ai/use-ai-command-bar';
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  ArrowUp,
  Loader,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  MoreVertical,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Draggable from 'react-draggable';

import {
  getDraggableInnerPlacementClass,
  getFloatingWrapperPlacementClass,
} from './ai-command-bar.utils';

const ENTER_TRANSITION = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const };
const EXIT_TRANSITION = { duration: 0.15, ease: [0.4, 0, 1, 1] as const };

const PANEL_BASE =
  'bg-background/90 flex flex-col overflow-hidden rounded-xl border border-white/15 shadow-lg backdrop-blur-md';

export function AiCommandBar() {
  const bar = useAiCommandBar();

  if (!bar.hasAnyEnabledCapabilities) return null;

  const persistentSuggestions =
    bar.capabilities.length > 0 && bar.messages.length > 0 ? (
      <div className="px-4 pt-2 pb-1">
        <CapabilitySuggestions
          capabilities={bar.capabilities}
          onSelect={bar.handleSuggestionClick}
          layout="scroll"
        />
      </div>
    ) : null;

  const contentArea = (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <AiMessageList
          visibleMessages={bar.visibleMessages}
          messagesCount={bar.messages.length}
          messageDomainFilter={bar.messageDomainFilter}
          hasCapabilities={bar.capabilities.length > 0}
          getDomainLabel={bar.getDomainLabel}
        />
      </div>
      {bar.capabilities.length > 0 && bar.messages.length === 0 && (
        <div className="px-4 pb-2">
          <CapabilitySuggestions
            capabilities={bar.capabilities}
            onSelect={bar.handleSuggestionClick}
            layout="wrap"
          />
        </div>
      )}
    </div>
  );

  const inputArea = (hintText: string) => (
    <div className="bg-muted/20 border-white/10 px-4 py-3">
      <div className="bg-background/50 relative rounded-xl border border-white/10 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20">
        <textarea
          ref={bar.textareaRef}
          value={bar.input}
          onChange={(e) => bar.setInput(e.target.value)}
          onKeyDown={bar.handleKeyDown}
          onCompositionStart={() => bar.setIsComposing(true)}
          onCompositionEnd={() => bar.setIsComposing(false)}
          onPointerDownCapture={(e) => e.stopPropagation()}
          className="placeholder:text-muted-foreground/60 w-full resize-none bg-transparent px-3 py-2 pr-10 text-sm outline-none"
          placeholder="What would you like to do?"
          rows={1}
        />
        <div className="absolute right-2 bottom-2">
          <Button
            type="button"
            size="icon"
            className="h-7 w-7 rounded-lg shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void bar.handleSubmit()}
            title="Send"
            disabled={!bar.input.trim() || bar.isLoading}
          >
            {bar.isLoading ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>
      </div>
      <div className="text-muted-foreground/50 mt-1 px-1 text-[10px]">
        {hintText}
      </div>
    </div>
  );

  const domainChips = (
    <AiDomainChips
      activeDomain={bar.activeDomain}
      domains={bar.domains}
      onSelectAll={() => {
        bar.setActiveDomain(null);
        bar.setMessageDomainFilter(null);
      }}
      onSelectDomain={(domain) => {
        bar.setActiveDomain(domain);
        bar.setMessageDomainFilter(domain);
      }}
      showMobileActions={bar.surfaceMode === 'floating'}
      onNewChat={() => bar.requestNewThread()}
      onClose={() => bar.close()}
    />
  );

  const expandedFloatingActions = (
    <div className="hidden flex-col gap-2 sm:flex">
      <button
        type="button"
        onClick={() => bar.close()}
        className="group bg-background/90 hover:bg-background flex size-8 items-center justify-center rounded-full border border-white/10 shadow-sm backdrop-blur-md transition-colors dark:bg-black/80"
        title="Close"
      >
        <X className="text-muted-foreground group-hover:text-foreground size-3" />
      </button>
      <button
        type="button"
        onClick={() => bar.dock('right')}
        className="group bg-background/90 hover:bg-background flex size-8 items-center justify-center rounded-full border border-white/10 shadow-sm backdrop-blur-md transition-colors dark:bg-black/80"
        title="Dock to side"
      >
        <Maximize2 className="text-muted-foreground group-hover:text-foreground size-3" />
      </button>
      <AiMoreActionsMenu
        onNewChat={() => bar.requestNewThread()}
        launcherPlacement={bar.launcherPlacement}
        onPlacementChange={bar.setLauncherPlacement}
        menuSide={bar.launcherPlacement === 'bottom-right' ? 'left' : 'right'}
        trigger={
          <button
            type="button"
            className="group bg-background/90 hover:bg-background flex size-8 items-center justify-center rounded-full border border-white/10 shadow-sm backdrop-blur-md transition-colors dark:bg-black/80"
            title="More actions"
          >
            <MoreVertical className="text-muted-foreground group-hover:text-foreground size-3" />
          </button>
        }
      />
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-60">
      {bar.surfaceMode === 'floating' && bar.isDraggingFloating && (
        <div className="pointer-events-none fixed top-0 right-0 bottom-0 z-50 flex w-24 items-center justify-center bg-blue-500/5 transition-opacity">
          <span className="text-muted-foreground text-xs font-medium">
            Drop to dock
          </span>
        </div>
      )}

      <AnimatePresence>
        {bar.surfaceMode === 'floating' && (
          <motion.div
            key="floating-wrapper"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16, transition: EXIT_TRANSITION }}
            transition={ENTER_TRANSITION}
            className={cn(
              'pointer-events-auto absolute bottom-5.5 flex gap-2',
              'inset-x-0 justify-center px-2',
              getFloatingWrapperPlacementClass(
                bar.launcherPlacement,
                bar.isExpanded,
              ),
            )}
          >
            <Draggable
              axis="x"
              position={{ x: bar.dragPositionX, y: 0 }}
              onStart={bar.handleFloatingDragStart}
              onDrag={bar.handleFloatingDrag}
              onStop={bar.handleFloatingDragStop}
              handle=".ai-floating-drag-handle"
              nodeRef={bar.draggableNodeRef}
              disabled={!bar.isDesktop}
            >
              <div
                ref={bar.draggableNodeRef}
                className={cn(
                  'flex w-fit gap-2',
                  getDraggableInnerPlacementClass(
                    bar.launcherPlacement,
                    bar.isExpanded,
                  ),
                )}
              >
                <div className="relative">
                  {bar.isDesktop && (
                    <div
                      className="ai-floating-drag-handle absolute top-0 right-0 z-10 h-full w-5 cursor-grab active:cursor-grabbing"
                      title="Drag to move or drag to right edge to dock"
                    />
                  )}
                  <div
                    className={cn(
                      'flex flex-col overflow-hidden',
                      bar.isExpanded
                        ? cn(
                            PANEL_BASE,
                            'max-h-[min(600px,50vh)] w-[min(520px,calc(100vw-3rem))]',
                          )
                        : 'w-[min(550px,calc(100vw-2rem))]',
                    )}
                  >
                    {bar.isExpanded && domainChips}
                    {bar.isExpanded && bar.messages.length > 0 && contentArea}

                    {!bar.isExpanded && (
                      <div className="mb-2 flex items-center gap-2">
                        <CapabilitySuggestions
                          capabilities={bar.capabilities}
                          onSelect={bar.handleSuggestionClick}
                          layout="scroll"
                          className="min-w-0 flex-1"
                          buttonRowClassName="flex gap-2"
                        />
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => bar.close()}
                            className={COMPACT_ACTION_BTN}
                            title="Close"
                          >
                            <X className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => bar.dock('right')}
                            className={cn(COMPACT_ACTION_BTN, 'hidden sm:flex')}
                            title="Dock to side"
                          >
                            <Maximize2 className="size-3" />
                          </button>
                          <AiMoreActionsMenu
                            onNewChat={() => bar.requestNewThread()}
                            launcherPlacement={bar.launcherPlacement}
                            onPlacementChange={bar.setLauncherPlacement}
                            trigger={
                              <button
                                type="button"
                                className={COMPACT_ACTION_BTN}
                                title="More actions"
                              >
                                <MoreVertical className="size-3" />
                              </button>
                            }
                          />
                        </div>
                      </div>
                    )}

                    {persistentSuggestions}

                    <div
                      className={cn(
                        'flex flex-col bg-inherit px-4 py-3',
                        bar.isExpanded ? '' : 'p-0',
                      )}
                    >
                      <div
                        className={cn(
                          'flex flex-col',
                          bar.isExpanded
                            ? 'bg-muted/20 border-white/10'
                            : 'bg-inherit p-0',
                        )}
                      >
                        <div
                          className={cn(
                            'relative flex w-full rounded-xl border shadow-sm',
                            bar.isExpanded
                              ? 'bg-background/50'
                              : 'bg-background/90 border-border shadow-lg backdrop-blur-xl dark:border-white/10!',
                          )}
                        >
                          <textarea
                            ref={bar.textareaRef}
                            value={bar.input}
                            onChange={(e) => bar.setInput(e.target.value)}
                            onKeyDown={bar.handleKeyDown}
                            onCompositionStart={() => bar.setIsComposing(true)}
                            onCompositionEnd={() => bar.setIsComposing(false)}
                            className="placeholder:text-muted-foreground/60 w-full resize-none bg-transparent px-3 py-2 pr-10 text-sm outline-none"
                            placeholder="What would you like to do?"
                            rows={1}
                            maxLength={2000}
                          />
                          <div className="absolute top-1/2 right-2 -translate-y-1/2">
                            <Button
                              type="button"
                              size="icon"
                              className="h-7 w-7 cursor-pointer rounded-lg shadow-sm"
                              onClick={() => void bar.handleSubmit()}
                              title="Send"
                              disabled={!bar.input.trim() || bar.isLoading}
                            >
                              {bar.isLoading ? (
                                <Loader className="size-4 animate-spin" />
                              ) : (
                                <ArrowUp className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                      {bar.isExpanded && (
                        <div className="text-muted-foreground/50 mt-1 px-1 text-[10px]">
                          ⌘K to toggle
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {bar.isExpanded && expandedFloatingActions}
              </div>
            </Draggable>
          </motion.div>
        )}
      </AnimatePresence>

      <AiCommandBarDocked
        bar={bar}
        contentArea={contentArea}
        persistentSuggestions={persistentSuggestions}
        inputArea={inputArea('Enter to send')}
      />

      <AiCommandBarLauncher bar={bar} />

      <AiCommandBarNewThreadDialog bar={bar} />
    </div>
  );
}

type AiCommandBarDockedProps = {
  bar: ReturnType<typeof useAiCommandBar>;
  contentArea: ReactNode;
  persistentSuggestions: ReactNode;
  inputArea: ReactNode;
};

function AiCommandBarDocked({
  bar,
  contentArea,
  persistentSuggestions,
  inputArea,
}: Readonly<AiCommandBarDockedProps>) {
  return (
    <AnimatePresence>
      {bar.surfaceMode === 'docked' && (
        <motion.div
          key="docked-panel"
          initial={{ opacity: 0, x: bar.dockSide === 'right' ? 30 : -30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{
            opacity: 0,
            x: bar.dockSide === 'right' ? 30 : -30,
            transition: EXIT_TRANSITION,
          }}
          transition={ENTER_TRANSITION}
          className={cn(
            PANEL_BASE,
            'pointer-events-auto absolute top-16 bottom-4',
            'right-2 left-2',
            'sm:w-(--dock-w)',
            bar.dockSide === 'right'
              ? 'sm:right-4 sm:left-auto'
              : 'sm:right-auto sm:left-4',
          )}
          style={{ '--dock-w': `${bar.dockWidthPx}px` } as React.CSSProperties}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-linear-to-tr from-blue-600 to-cyan-500 text-white shadow-sm">
                <Loader className="size-3" />
              </div>
              <span className="text-foreground text-sm font-medium">
                {bar.activeDomain
                  ? (bar.enabledRegistrations.get(bar.activeDomain)
                      ?.domainLabel ?? domainLabelFallback(bar.activeDomain))
                  : 'All'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
                onClick={() => bar.requestNewThread()}
                title="New chat"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
                onClick={() => bar.undock()}
                title="Floating mode"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground h-7 w-7"
                    title="More"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  className="z-150 w-56"
                >
                  <DropdownMenuLabel>Messages</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={!bar.messageDomainFilter}
                    onCheckedChange={(checked) => {
                      if (checked) bar.setMessageDomainFilter(null);
                    }}
                  >
                    All domains
                  </DropdownMenuCheckboxItem>
                  {bar.messageDomains.map((d) => (
                    <DropdownMenuCheckboxItem
                      key={d}
                      checked={bar.messageDomainFilter === d}
                      onCheckedChange={(checked) =>
                        bar.setMessageDomainFilter(checked ? d : null)
                      }
                    >
                      {bar.enabledRegistrations.get(d)?.domainLabel ??
                        domainLabelFallback(d)}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <LauncherPlacementPicker
                    launcherPlacement={bar.launcherPlacement}
                    onPlacementChange={bar.setLauncherPlacement}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
                onClick={() => bar.close()}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {contentArea}
          {persistentSuggestions}
          {inputArea}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AiCommandBarLauncher({
  bar,
}: Readonly<{ bar: ReturnType<typeof useAiCommandBar> }>) {
  return (
    <div
      className={cn(
        'pointer-events-auto absolute bottom-2',
        bar.launcherPlacement === 'bottom-center'
          ? 'left-1/2 -translate-x-1/2'
          : 'right-4',
      )}
    >
      <button
        type="button"
        onClick={() => (bar.visible ? bar.close() : bar.open())}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full border transition-colors',
          bar.visible
            ? 'border-blue-500/50 bg-blue-600 text-white'
            : 'bg-background/80 hover:bg-background border-white/20 shadow-sm dark:border-white/10 dark:bg-black/60',
        )}
        title="Toggle AI (⌘K)"
      >
        <div className="from-primary dark:from-background flex h-full w-full items-center justify-center rounded-full bg-linear-to-tr to-blue-500 text-white">
          <Loader className={cn('size-3', !bar.visible ? 'spin-pause' : '')} />
        </div>
      </button>
    </div>
  );
}

function AiCommandBarNewThreadDialog({
  bar,
}: Readonly<{ bar: ReturnType<typeof useAiCommandBar> }>) {
  return (
    <AlertDialog open={bar.pendingConfirm?.type === 'new-thread'}>
      <AlertDialogContent className="z-500">
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This will start a fresh thread and you may lose current context.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => bar.confirmPending(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => bar.confirmPending(true)}>
            New chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
