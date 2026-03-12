import { describe, expect, it } from 'vitest';

import {
    getImagePreviewStatusLabel,
    getPendingImagePreviewState,
    getRemoteImagePreviewState,
} from '@/web/components/conversation/messages/imagePreviewState';

describe('imagePreviewState', () => {
    it('maps pending image states to the shared preview model', () => {
        expect(getPendingImagePreviewState('queued')).toBe('loading');
        expect(getPendingImagePreviewState('compressing')).toBe('loading');
        expect(getPendingImagePreviewState('ready')).toBe('ready');
        expect(getPendingImagePreviewState('failed')).toBe('failed');
    });

    it('derives remote preview states from query and object url state', () => {
        expect(
            getRemoteImagePreviewState({
                enabled: false,
                hasObjectUrl: false,
                isLoading: false,
                found: undefined,
                hasError: false,
            })
        ).toBe('idle');
        expect(
            getRemoteImagePreviewState({
                enabled: true,
                hasObjectUrl: false,
                isLoading: true,
                found: undefined,
                hasError: false,
            })
        ).toBe('loading');
        expect(
            getRemoteImagePreviewState({
                enabled: true,
                hasObjectUrl: true,
                isLoading: false,
                found: true,
                hasError: false,
            })
        ).toBe('ready');
        expect(
            getRemoteImagePreviewState({
                enabled: true,
                hasObjectUrl: false,
                isLoading: false,
                found: false,
                hasError: false,
            })
        ).toBe('failed');
    });

    it('formats compact preview labels', () => {
        expect(getImagePreviewStatusLabel('idle')).toBe('Preview idle');
        expect(getImagePreviewStatusLabel('loading')).toBe('Loading');
        expect(getImagePreviewStatusLabel('ready')).toBe('Ready');
        expect(getImagePreviewStatusLabel('failed')).toBe('Needs attention');
    });
});
