import { useState } from 'react';

import { useNeonObservabilityStreamStore } from '@/web/lib/observability/eventStream';

import type { NeonObservabilityEvent } from '@/app/backend/runtime/contracts';

export interface NeonRuntimeEventFilters {
    profileId: string;
    sessionId: string;
    runId: string;
}

function matchesFilter(value: string, candidate: string): boolean {
    return value.trim().length === 0 || candidate.toLowerCase().includes(value.trim().toLowerCase());
}

export function filterNeonObservabilityEvents(
    events: NeonObservabilityEvent[],
    filters: NeonRuntimeEventFilters
): NeonObservabilityEvent[] {
    return [...events]
        .reverse()
        .filter((event) => matchesFilter(filters.profileId, event.profileId))
        .filter((event) => matchesFilter(filters.sessionId, event.sessionId))
        .filter((event) => matchesFilter(filters.runId, event.runId));
}

function formatEventSummary(event: NeonObservabilityEvent): string {
    if (event.kind === 'stream_chunk') {
        return `stream.${event.chunk.kind}`;
    }

    if (event.kind === 'tool_state_changed') {
        return `tool.${event.toolName}.${event.state}`;
    }

    if (event.kind === 'transport_selected') {
        return `transport.${event.selectedTransportFamily}`;
    }

    return event.kind;
}

export function NeonRuntimeDevtoolsPanel() {
    const connectionState = useNeonObservabilityStreamStore((state) => state.connectionState);
    const lastSequence = useNeonObservabilityStreamStore((state) => state.lastSequence);
    const lastError = useNeonObservabilityStreamStore((state) => state.lastError);
    const events = useNeonObservabilityStreamStore((state) => state.events);
    const [filters, setFilters] = useState<NeonRuntimeEventFilters>({
        profileId: '',
        sessionId: '',
        runId: '',
    });
    const [selectedSequence, setSelectedSequence] = useState<number | undefined>(undefined);

    const filteredEvents = filterNeonObservabilityEvents(events, filters);
    const selectedEvent =
        filteredEvents.find((event) => event.sequence === selectedSequence) ?? filteredEvents[0] ?? null;

    return (
        <div className='flex h-full min-h-0 flex-col gap-3 p-3 text-sm'>
            <div className='grid gap-2 md:grid-cols-4'>
                <div className='rounded-md border border-border/60 bg-card/70 p-2'>
                    <div className='text-muted-foreground text-xs uppercase'>Connection</div>
                    <div className='font-medium'>{connectionState}</div>
                </div>
                <div className='rounded-md border border-border/60 bg-card/70 p-2'>
                    <div className='text-muted-foreground text-xs uppercase'>Buffered Events</div>
                    <div className='font-medium'>{String(filteredEvents.length)}</div>
                </div>
                <div className='rounded-md border border-border/60 bg-card/70 p-2'>
                    <div className='text-muted-foreground text-xs uppercase'>Last Sequence</div>
                    <div className='font-medium'>{String(lastSequence)}</div>
                </div>
                <div className='rounded-md border border-border/60 bg-card/70 p-2'>
                    <div className='text-muted-foreground text-xs uppercase'>Last Error</div>
                    <div className='font-medium'>{lastError ?? 'None'}</div>
                </div>
            </div>
            <div className='grid gap-2 md:grid-cols-3'>
                <label className='flex flex-col gap-1'>
                    <span className='text-muted-foreground text-xs uppercase'>Profile</span>
                    <input
                        className='rounded-md border border-border/60 bg-background px-2 py-1'
                        value={filters.profileId}
                        onChange={(event) => {
                            setFilters((current) => ({
                                ...current,
                                profileId: event.target.value,
                            }));
                        }}
                    />
                </label>
                <label className='flex flex-col gap-1'>
                    <span className='text-muted-foreground text-xs uppercase'>Session</span>
                    <input
                        className='rounded-md border border-border/60 bg-background px-2 py-1'
                        value={filters.sessionId}
                        onChange={(event) => {
                            setFilters((current) => ({
                                ...current,
                                sessionId: event.target.value,
                            }));
                        }}
                    />
                </label>
                <label className='flex flex-col gap-1'>
                    <span className='text-muted-foreground text-xs uppercase'>Run</span>
                    <input
                        className='rounded-md border border-border/60 bg-background px-2 py-1'
                        value={filters.runId}
                        onChange={(event) => {
                            setFilters((current) => ({
                                ...current,
                                runId: event.target.value,
                            }));
                        }}
                    />
                </label>
            </div>
            <div className='grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
                <div className='min-h-0 overflow-auto rounded-md border border-border/60 bg-card/50'>
                    {filteredEvents.length === 0 ? (
                        <div className='text-muted-foreground p-3'>No Neon observability events buffered.</div>
                    ) : (
                        <ul className='divide-y divide-border/50'>
                            {filteredEvents.map((event) => {
                                const isSelected = selectedEvent?.sequence === event.sequence;
                                return (
                                    <li key={event.sequence}>
                                        <button
                                            className={`flex w-full flex-col gap-1 px-3 py-2 text-left ${
                                                isSelected ? 'bg-accent/60' : 'hover:bg-accent/30'
                                            }`}
                                            type='button'
                                            onClick={() => {
                                                setSelectedSequence(event.sequence);
                                            }}
                                        >
                                            <div className='flex items-center justify-between gap-2'>
                                                <span className='font-medium'>{formatEventSummary(event)}</span>
                                                <span className='text-muted-foreground text-xs'>#{String(event.sequence)}</span>
                                            </div>
                                            <div className='text-muted-foreground text-xs'>
                                                {event.profileId} · {event.sessionId} · {event.runId}
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
                <div className='min-h-0 overflow-auto rounded-md border border-border/60 bg-card/50 p-3'>
                    {selectedEvent ? (
                        <pre className='whitespace-pre-wrap break-words text-xs'>
                            {JSON.stringify(selectedEvent, null, 2)}
                        </pre>
                    ) : (
                        <div className='text-muted-foreground'>Select an event to inspect its payload.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
