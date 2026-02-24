import { useEffect, useRef, useState } from 'react';
import { AiAssistButton } from '@/components/ai/ai-assist-button';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { aiRuntimeStore } from '@/modules/ai';
import { Pencil } from 'lucide-react';

import { LineInfoCard } from './line-info-card';
import { PanelEmptyState } from './panel-empty-state';
import { formatIsoDate } from './statement-utils';

import type { StatementLine, StatementNote } from './statement-types';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset edit state when the selected line or note changes
  useEffect(() => {
    setIsEditing(false);
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

  const handleRegenerate = () => {
    aiRuntimeStore
      .getState()
      .setInput(
        `Generate a financial note for "${selectedLine.label}" explaining the key movements and context for the current period.`,
      );
    aiRuntimeStore.getState().open();
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
                onClick={handleRegenerate}
                label="Generate with AI"
                className="text-xs"
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

        {/* Edit controls (bookkeeper only) */}
        {canEdit && isEditing && (
          <div className="flex items-center justify-between pt-1">
            <AiAssistButton
              onClick={handleRegenerate}
              label="Regenerate"
              className="text-xs"
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
        {canEdit && !isEditing && (
          <div className="flex items-center justify-between">
            <AiAssistButton
              onClick={handleRegenerate}
              label="Regenerate with AI"
              className="text-xs"
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
