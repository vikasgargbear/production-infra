import { Capacitor, registerPlugin } from '@capacitor/core';

const MAX_NATIVE_EXPORT_BYTES = 50 * 1024 * 1024;

interface PrivateFileDownloadPlugin {
    save(options: {
        filename: string;
        mimeType: string;
        base64: string;
    }): Promise<{ saved: boolean }>;
}

interface TrackedBlob {
    blob: Blob;
    pendingSaves: number;
    revokeRequested: boolean;
}

const PrivateFileDownload = registerPlugin<PrivateFileDownloadPlugin>(
    'PrivateFileDownload',
);

let installed = false;

export const normalizeAndroidFilename = (filename: string): string => {
    const cleaned = filename
        .split('')
        .map(character => {
            const codePoint = character.charCodeAt(0);
            return codePoint < 32 || codePoint === 127 || /[\\/:*?"<>|]/.test(character)
                ? '_'
                : character;
        })
        .join('')
        .trim();
    return (cleaned || 'aasopharma-export').slice(0, 120);
};

export const normalizeAndroidMimeType = (mimeType: string): string => {
    const candidate = mimeType.split(';', 1)[0].trim();
    return /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(candidate)
        ? candidate
        : 'application/octet-stream';
};

export const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Unable to read export'));
        reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            const separator = dataUrl.indexOf(',');
            if (separator < 0) {
                reject(new Error('Unable to encode export'));
                return;
            }
            resolve(dataUrl.slice(separator + 1));
        };
        reader.readAsDataURL(blob);
    });

const saveBlob = async (blob: Blob, filename: string): Promise<void> => {
    if (blob.size === 0 || blob.size > MAX_NATIVE_EXPORT_BYTES) {
        throw new Error('Android exports must be between 1 byte and 50 MB');
    }

    await PrivateFileDownload.save({
        filename: normalizeAndroidFilename(filename),
        mimeType: normalizeAndroidMimeType(blob.type),
        base64: await blobToBase64(blob),
    });
};

const showNativeExportError = (): void => {
    const message = document.createElement('div');
    message.setAttribute('role', 'alert');
    message.textContent = 'Unable to save this export on Android. Please try again.';
    Object.assign(message.style, {
        position: 'fixed',
        left: '16px',
        right: '16px',
        bottom: '80px',
        zIndex: '2147483647',
        padding: '12px 16px',
        borderRadius: '8px',
        color: '#ffffff',
        background: '#b91c1c',
        textAlign: 'center',
    });
    document.body.appendChild(message);
    window.setTimeout(() => message.remove(), 5000);
};

export const installAndroidNativeBridge = (): boolean => {
    if (
        installed ||
        !Capacitor.isNativePlatform() ||
        Capacitor.getPlatform() !== 'android' ||
        typeof URL.createObjectURL !== 'function'
    ) {
        return false;
    }

    const tracked = new Map<string, TrackedBlob>();
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    const originalAnchorClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = (object: Blob | MediaSource): string => {
        const url = originalCreateObjectURL(object);
        if (object instanceof Blob) {
            tracked.set(url, {
                blob: object,
                pendingSaves: 0,
                revokeRequested: false,
            });
        }
        return url;
    };

    URL.revokeObjectURL = (url: string): void => {
        const item = tracked.get(url);
        if (item?.pendingSaves) {
            item.revokeRequested = true;
            return;
        }
        tracked.delete(url);
        originalRevokeObjectURL(url);
    };

    HTMLAnchorElement.prototype.click = function androidNativeDownloadClick(): void {
        const blobUrl = this.href;
        const item = tracked.get(blobUrl);
        if (!item || !this.hasAttribute('download')) {
            originalAnchorClick.call(this);
            return;
        }

        item.pendingSaves += 1;
        void saveBlob(item.blob, this.download).catch(error => {
            console.error('Android export failed', error);
            showNativeExportError();
        }).finally(() => {
            item.pendingSaves -= 1;
            if (item.pendingSaves === 0 && item.revokeRequested) {
                tracked.delete(blobUrl);
                originalRevokeObjectURL(blobUrl);
            }
        });
    };

    installed = true;
    return true;
};
