/** Explain deployment/offline failures without discarding in-progress work. */
export function invoiceOutputErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && (error.name === 'ChunkLoadError'
        || /Loading (?:CSS )?chunk .*failed|Failed to fetch dynamically imported module/i.test(error.message))) {
        return 'The invoice download tools could not load. Your entries have not been cleared. Save any unfinished draft, then refresh this page and retry from Sales History.';
    }
    return error instanceof Error ? error.message : fallback;
}
