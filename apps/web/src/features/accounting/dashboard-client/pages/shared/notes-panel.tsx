import { useEffect, useRef, useState } from 'react';
import { AiAssistButton } from '@/components/ai/ai-assist-button';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AI_DOMAINS, makeCapabilityId, useAiInlineAction } from '@/modules/ai';
import { Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

import { LineInfoCard } from './line-info-card';
import { PanelEmptyState } from './panel-empty-state';
import { formatIsoDate } from './statement-utils';

import type { StatementLine, StatementNote } from './statement-types';

const REPORTING_DRAFT_NOTE_CAPABILITY_ID = makeCapabilityId({
  domain: AI_DOMAINS.reporting,
  name: 'explain',
  version: 1,
});

function formatAttribution(note: StatementNote): string {
  if (note.source === 'ai') return 'Auto-generated';
  if (note.source === 'ai_edited')
    return note.updatedBy
      ? `Auto-generated · Last edited by ${note.updatedBy}`
      : `Auto-generated · Last edited`;
  return note.updatedBy ?? 'Manual note';
}

export type NotesPanelProps = {
  selectedLine: StatementLine | null;
  note: StatementNote | null;
  canEdit: boolean;
  periodLabel?: string;
  onSave?: (lineId: string, body: string) => void;
};

export function NotesPanel({
  selectedLine,
  note,
  canEdit,
  periodLabel,
  onSave,
}: NotesPanelProps) {
  const [editBody, setEditBody] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draftedText, setDraftedText] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftNote = useAiInlineAction({
    capabilityId: REPORTING_DRAFT_NOTE_CAPABILITY_ID,
    domain: AI_DOMAINS.reporting,
  });
  const isDrafting = draftNote.isRunning;

  // Reset edit/draft state when the selected line or note changes
  useEffect(() => {
    setIsEditing(false);
    setDraftedText(null);
    setEditBody(note?.body ?? '');
  }, [selectedLine?.id, note?.body]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  if (!selectedLine) {
    return <PanelEmptyState message="Select a line to see notes." />;
  }

  const handleStartEdit = () => {
    setEditBody(note?.body ?? '');
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmed = editBody.trim();
    if (trimmed && onSave) {
      onSave(selectedLine.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditBody(note?.body ?? '');
    setIsEditing(false);
  };

  const handleStartDrafting = async () => {
    if (!selectedLine) return;
    setDraftedText(null);

    const prompt = [
      'Draft a concise accounting note for this financial statement line.',
      `Line label: ${selectedLine.label}`,
      `Current period amount: ${selectedLine.amount}`,
      `Comparison period amount: ${selectedLine.compareAmount}`,
      periodLabel ? `Period label: ${periodLabel}` : undefined,
      note?.body ? `Existing note: ${note.body}` : 'No existing note.',
      'Write only the final note text in plain language. Keep it under 120 words.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const result = await draftNote.run({
        prompt,
      });
      setDraftedText(result.assistantText);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Unable to draft note.';
      toast.error(message);
    }
  };

  const handleDiscardDraft = () => {
    setDraftedText(null);
  };

  const handleReplaceWithDraft = () => {
    if (!selectedLine || !draftedText || !onSave) return;
    onSave(selectedLine.id, draftedText);
    setDraftedText(null);
  };

  const handleInsertBelow = () => {
    if (!selectedLine || !draftedText || !onSave) return;
    const currentBody = note?.body ? `${note.body}\n\n` : '';
    onSave(selectedLine.id, currentBody + draftedText);
    setDraftedText(null);
  };

  // No note exists
  if (!note) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 text-sm">
        <LineInfoCard title={selectedLine.label} subtitle={periodLabel} />

        <div className="text-muted-foreground mt-12 flex flex-1 flex-col items-center gap-3 text-center text-xs">
          <p>
            {canEdit
              ? 'No notes have been added yet.'
              : 'No notes available for this line.'}
          </p>
          {canEdit && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleStartEdit}
              >
                Add manual note
              </Button>
              <AiAssistButton
                onClick={handleStartDrafting}
                label={isDrafting ? 'Drafting...' : 'Draft note'}
                title="Auto-draft note"
                className="text-xs"
                disabled={isDrafting}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Note exists
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 text-sm">
      <LineInfoCard title={selectedLine.label} subtitle={periodLabel} />

      <div className="mt-1 flex flex-col gap-3 md:gap-0">
        {canEdit && isEditing ? (
          <Textarea
            ref={textareaRef}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="min-h-32 resize-none bg-transparent text-sm leading-relaxed"
            placeholder="Write a note..."
          />
        ) : (
          <div className="bg-background border-border/50 rounded-xl border p-4 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
            {note.body}
          </div>
        )}

        {/* Inline Draft Review State */}
        {draftedText && (
          <div className="border-primary/30 bg-primary/5 mt-4 rounded-xl border p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-primary flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                Draft proposal
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-muted/50 size-6"
                onClick={handleDiscardDraft}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
              {draftedText}
            </p>
            <div className="border-primary/10 mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
              <Button
                size="sm"
                className="text-xs"
                onClick={handleReplaceWithDraft}
              >
                Replace
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleInsertBelow}
              >
                Insert below
              </Button>
            </div>
          </div>
        )}

        {/* Edit controls (bookkeeper only) */}
        {canEdit && isEditing && !draftedText && (
          <div className="flex items-center justify-between pt-1">
            <AiAssistButton
              onClick={handleStartDrafting}
              label={isDrafting ? 'Drafting...' : 'Draft rewrite'}
              title="Auto-rewrite note"
              className="text-xs"
              disabled={isDrafting}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs"
                disabled={!editBody.trim()}
                onClick={handleSave}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Edit trigger for non-editing bookkeeper view */}
        {canEdit && !isEditing && !draftedText && (
          <div className="flex items-center justify-between">
            <AiAssistButton
              onClick={handleStartDrafting}
              label={isDrafting ? 'Drafting...' : 'Draft note'}
              title="Auto-draft note"
              className="text-xs"
              disabled={isDrafting}
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground text-xs"
              onClick={handleStartEdit}
            >
              <Pencil className="mr-1.5 size-3" />
              Edit note
            </Button>
          </div>
        )}
      </div>

      {/* Attribution */}
      <div className="text-muted-foreground mt-2 shrink-0 text-[11px]">
        <p>
          {formatAttribution(note)} on{' '}
          {formatIsoDate(note.updatedAt, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
    </div>
  );
}
