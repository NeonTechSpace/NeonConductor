import { skipToken } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { ToolArtifactKind, ToolArtifactPreviewStrategy } from '@/web/components/conversation/messages/toolArtifactFormatting';
import type { ToolArtifactViewerDialogProps } from '@/web/components/conversation/panels/toolArtifactViewerDialog';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { trpc } from '@/web/trpc/client';

import type { EntityId } from '@/shared/contracts';

export const TOOL_ARTIFACT_VIEWER_PAGE_LINE_COUNT = 400;

export function getCenteredToolArtifactStartLine(lineNumber: number, lineCount = TOOL_ARTIFACT_VIEWER_PAGE_LINE_COUNT) {
    return Math.max(1, lineNumber - Math.floor(lineCount / 2));
}

export function getPreviousToolArtifactStartLine(startLine: number, lineCount: number) {
    return Math.max(1, startLine - lineCount);
}

export function getNextToolArtifactStartLine(startLine: number, lineCount: number) {
    return Math.max(1, startLine + lineCount);
}

interface UseToolArtifactViewerControllerInput {
    profileId: string;
    selectedSessionId: string | undefined;
    onPromoteArtifactWindow?: (input: {
        sessionId: EntityId<'sess'>;
        messagePartId: EntityId<'part'>;
        startLine: number;
        lineCount: number;
    }) => void;
}

interface ToolArtifactViewerArtifactLine {
    lineNumber: number;
    text: string;
}

interface ToolArtifactViewerSearchMatch {
    lineNumber: number;
    lineText: string;
    matchStart: number;
    matchEnd: number;
}

interface ToolArtifactViewerArtifact {
    messagePartId: EntityId<'part'>;
    toolName: string;
    artifactKind: ToolArtifactKind;
    contentType: string;
    totalBytes: number;
    totalLines: number;
    previewStrategy: ToolArtifactPreviewStrategy;
    metadata: Record<string, unknown>;
    startLine: number;
    lineCount: number;
    lines: ToolArtifactViewerArtifactLine[];
    hasPrevious: boolean;
    hasNext: boolean;
}

function createEmptyDialogProps(
    input: Pick<ToolArtifactViewerDialogProps, 'onClose' | 'onNextPage' | 'onPreviousPage' | 'onSearchDraftChange' | 'onSearchSubmit' | 'onSelectSearchMatch'>
): ToolArtifactViewerDialogProps {
    return {
        open: false,
        isLoading: false,
        isUnavailable: false,
        searchDraftValue: '',
        searchMatches: [],
        searchTruncated: false,
        isSearching: false,
        ...input,
    };
}

export function useToolArtifactViewerController({
    profileId,
    selectedSessionId,
    onPromoteArtifactWindow,
}: UseToolArtifactViewerControllerInput) {
    const [selectedMessagePartId, setSelectedMessagePartId] = useState<EntityId<'part'> | undefined>(undefined);
    const [startLine, setStartLine] = useState(1);
    const [searchDraftValue, setSearchDraftValue] = useState('');
    const [submittedSearchQuery, setSubmittedSearchQuery] = useState<string | undefined>(undefined);

    const resolvedSessionId = isEntityId(selectedSessionId, 'sess') ? selectedSessionId : undefined;

    useEffect(() => {
        setSelectedMessagePartId(undefined);
        setStartLine(1);
        setSearchDraftValue('');
        setSubmittedSearchQuery(undefined);
    }, [resolvedSessionId]);

    const readQueryInput =
        resolvedSessionId && selectedMessagePartId
            ? {
                  profileId,
                  sessionId: resolvedSessionId,
                  messagePartId: selectedMessagePartId,
                  startLine,
                  lineCount: TOOL_ARTIFACT_VIEWER_PAGE_LINE_COUNT,
              }
            : skipToken;
    const searchQueryInput =
        resolvedSessionId && selectedMessagePartId && submittedSearchQuery
            ? {
                  profileId,
                  sessionId: resolvedSessionId,
                  messagePartId: selectedMessagePartId,
                  query: submittedSearchQuery,
              }
            : skipToken;

    const readArtifactQuery = trpc.conversation.readToolArtifact.useQuery(readQueryInput);
    const searchArtifactQuery = trpc.conversation.searchToolArtifact.useQuery(searchQueryInput);

    const artifact =
        readArtifactQuery.data?.found === true
            ? ({
                  ...readArtifactQuery.data.artifact,
              } satisfies ToolArtifactViewerArtifact)
            : undefined;
    const searchMatches =
        searchArtifactQuery.data?.found === true
            ? (searchArtifactQuery.data.matches satisfies ToolArtifactViewerSearchMatch[])
            : [];
    const isOpen = selectedMessagePartId !== undefined;

    function handleClose() {
        setSelectedMessagePartId(undefined);
        setStartLine(1);
        setSearchDraftValue('');
        setSubmittedSearchQuery(undefined);
    }

    function handleSearchSubmit() {
        const trimmedQuery = searchDraftValue.trim();
        setSubmittedSearchQuery(trimmedQuery.length > 0 ? trimmedQuery : undefined);
    }

    function handleSelectSearchMatch(lineNumber: number) {
        setStartLine(getCenteredToolArtifactStartLine(lineNumber));
    }

    return {
        openToolArtifact: (messagePartId: EntityId<'part'>) => {
            if (!resolvedSessionId) {
                return;
            }

            setSelectedMessagePartId(messagePartId);
            setStartLine(1);
            setSearchDraftValue('');
            setSubmittedSearchQuery(undefined);
        },
        dialogProps: isOpen
            ? ({
                  open: true,
                  isLoading: readArtifactQuery.isPending,
                  ...(artifact ? { artifact } : {}),
                  isUnavailable: !readArtifactQuery.isPending && !artifact,
                  searchDraftValue,
                  searchMatches,
                  searchTruncated: searchArtifactQuery.data?.found === true && searchArtifactQuery.data.truncated,
                  isSearching: searchArtifactQuery.isPending,
                  onSearchDraftChange: setSearchDraftValue,
                  onSearchSubmit: handleSearchSubmit,
                  onSelectSearchMatch: handleSelectSearchMatch,
                  onPreviousPage: () => {
                      const lineCount = artifact?.lineCount ?? TOOL_ARTIFACT_VIEWER_PAGE_LINE_COUNT;
                      setStartLine((current) => getPreviousToolArtifactStartLine(current, lineCount));
                  },
                  onNextPage: () => {
                      const lineCount = artifact?.lineCount ?? TOOL_ARTIFACT_VIEWER_PAGE_LINE_COUNT;
                      setStartLine((current) => getNextToolArtifactStartLine(current, lineCount));
                  },
                  ...(onPromoteArtifactWindow && resolvedSessionId
                      ? {
                            onPromoteVisibleLines: () => {
                                onPromoteArtifactWindow({
                                    sessionId: resolvedSessionId,
                                    messagePartId: selectedMessagePartId,
                                    startLine,
                                    lineCount: artifact?.lineCount ?? TOOL_ARTIFACT_VIEWER_PAGE_LINE_COUNT,
                                });
                            },
                        }
                      : {}),
                  onClose: handleClose,
              } satisfies ToolArtifactViewerDialogProps)
            : createEmptyDialogProps({
                  onClose: handleClose,
                  onNextPage: () => {
                      return;
                  },
                  onPreviousPage: () => {
                      return;
                  },
                  onSearchDraftChange: setSearchDraftValue,
                  onSearchSubmit: handleSearchSubmit,
                  onSelectSearchMatch: handleSelectSearchMatch,
              }),
    };
}
