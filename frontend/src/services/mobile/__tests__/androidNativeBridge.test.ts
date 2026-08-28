import {
    blobToBase64,
    normalizeAndroidFilename,
    normalizeAndroidMimeType,
} from '../androidNativeBridge';

describe('Android native download bridge helpers', () => {
    it('normalizes filenames used by the Android document picker', () => {
        expect(normalizeAndroidFilename(' report:Q3/2026?.csv ')).toBe(
            'report_Q3_2026_.csv',
        );
        expect(normalizeAndroidFilename('   ')).toBe('aasopharma-export');
        expect(normalizeAndroidFilename('a'.repeat(130))).toHaveLength(120);
    });

    it('allows simple MIME types and rejects unsafe values', () => {
        expect(normalizeAndroidMimeType('text/csv;charset=utf-8')).toBe('text/csv');
        expect(normalizeAndroidMimeType('application/pdf')).toBe('application/pdf');
        expect(normalizeAndroidMimeType('not a mime')).toBe(
            'application/octet-stream',
        );
    });

    it('encodes a Blob payload without the data URL prefix', async () => {
        await expect(blobToBase64(new Blob(['AASO']))).resolves.toBe('QUFTTw==');
    });
});
