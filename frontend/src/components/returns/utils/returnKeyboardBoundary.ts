/**
 * Nested controls own a key once they call preventDefault. In particular, an
 * open Select consumes Escape to close its menu and restore focus; the return
 * flow must not also navigate back or close the module for that same keypress.
 */
export function returnFlowOwnsEscape(event: Pick<KeyboardEvent, 'key' | 'defaultPrevented'>): boolean {
  return event.key === 'Escape' && !event.defaultPrevented;
}
