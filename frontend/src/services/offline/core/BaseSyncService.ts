/**
 * BaseSyncService — Shared abstract base for all module sync services.
 *
 * Provides: state management, subscriber pattern, background sync interval,
 * and a default performInitialSync (warmCache only).
 *
 * Subclasses override warmCache + onStop. Advanced services override
 * performInitialSync and performDeltaSync for multi-phase sync.
 */

export interface BaseSyncState {
    phase: string;
    progress: number;
    isReady: boolean;
    lastSync: string | Date | null;
    error?: string | null;
}

export abstract class BaseSyncService<TState extends BaseSyncState> {
    protected state: TState;
    private listeners = new Set<(state: TState) => void>();
    private bgSyncInterval: ReturnType<typeof setInterval> | null = null;

    protected abstract readonly logPrefix: string;

    constructor(initialState: TState) {
        this.state = initialState;
    }

    // ==================== STATE MANAGEMENT ====================

    protected updateState(partial: Partial<TState>): void {
        this.state = { ...this.state, ...partial };
        this.notifyListeners();
    }

    protected notifyListeners(): void {
        for (const listener of this.listeners) {
            try {
                listener(this.state);
            } catch (error) {
                console.error(`${this.logPrefix} Listener error:`, error);
            }
        }
    }

    subscribe(listener: (state: TState) => void): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => { this.listeners.delete(listener); };
    }

    getState(): TState {
        return { ...this.state };
    }

    isReady(): boolean {
        return this.state.isReady;
    }

    // ==================== INITIAL SYNC (default: warmCache only) ====================

    async performInitialSync(): Promise<void> {
        if (this.state.phase !== 'idle' && this.state.phase !== 'error') return;

        console.log(`${this.logPrefix} Starting initial sync...`);

        try {
            await this.warmCache();

            this.updateState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date().toISOString()
            } as Partial<TState>);

            console.log(`${this.logPrefix} ✅ Initial sync complete!`);
        } catch (error) {
            console.error(`${this.logPrefix} Sync failed:`, error);
            this.updateState({
                phase: 'error',
                error: (error as Error).message
            } as Partial<TState>);
        }
    }

    // ==================== BACKGROUND SYNC ====================

    startBackgroundSync(intervalMs = 5 * 60 * 1000): void {
        if (this.bgSyncInterval) {
            clearInterval(this.bgSyncInterval);
        }

        this.bgSyncInterval = setInterval(() => {
            if (navigator.onLine) {
                this.performDeltaSync();
            }
        }, intervalMs);

        console.log(`${this.logPrefix} Background sync started (${intervalMs / 1000}s interval)`);
    }

    stopBackgroundSync(): void {
        if (this.bgSyncInterval) {
            clearInterval(this.bgSyncInterval);
            this.bgSyncInterval = null;
        }
    }

    protected async performDeltaSync(): Promise<void> {
        // Override in subclasses that support delta sync
    }

    // ==================== CLEANUP ====================

    stop(): void {
        this.stopBackgroundSync();
        this.onStop();
        this.updateState({
            phase: 'idle',
            progress: 0,
            isReady: false
        } as Partial<TState>);
        console.log(`${this.logPrefix} Stopped`);
    }

    // ==================== ABSTRACT ====================

    protected abstract warmCache(): Promise<void>;
    protected abstract onStop(): void;
}
