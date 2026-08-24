/** Failures that may safely fall back to an explicitly queued offline write. */
export function isRecoverableOfflineFailure(error: any): boolean {
    return error?.response?.status >= 500
        || error?.code === 'ERR_NETWORK'
        || error?.code === 'ECONNABORTED';
}
