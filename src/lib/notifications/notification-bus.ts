/**
 * 2026-05-27 — In-process notification bus for SSE streaming
 * (PR-C of the notification streaming + alerts roadmap).
 *
 * Per-(tenant, user) pub/sub backing the SSE endpoint at
 * `src/app/api/notifications/stream/route.ts`. Subscribers register
 * a `send(event)` callback; publishers (the notification create
 * helpers in `src/app-layer/notifications/`) fan out events to
 * every matching subscriber.
 *
 * Single-process by design. A multi-pod deployment will see each
 * pod hold its own subscriber set — a notification created on pod
 * A won't push to a subscriber on pod B. The 60s polling fallback
 * in `notifications-bell.tsx` covers that gap (the user sees the
 * notification on their next poll). When cross-pod fanout becomes
 * load-bearing, this module is the natural seam to back with
 * Redis pub/sub.
 *
 * Why module-level state and not a Provider:
 *   The publish side is called from server-side usecases (Node
 *   process scope), the subscribe side from a streaming route
 *   handler (also Node process scope). Both share the same
 *   in-process module instance. A Provider/context wouldn't help
 *   — there's no React tree connecting them.
 */

/**
 * Public event shape pushed to subscribers. Mirrors the columns
 * the bell consumes today + nothing the user shouldn't see.
 */
export interface NotificationEvent {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    linkUrl: string | null;
    createdAt: string;
}

interface Subscriber {
    tenantId: string;
    userId: string;
    send: (event: NotificationEvent) => void;
}

const subscribers = new Set<Subscriber>();

/**
 * Register a subscriber. Returns an unsubscribe function the
 * caller MUST invoke on disconnect — otherwise the Set grows
 * unboundedly under tab churn.
 */
export function subscribeToNotifications(sub: Subscriber): () => void {
    subscribers.add(sub);
    return () => {
        subscribers.delete(sub);
    };
}

/**
 * Fan-out one event to every subscriber matching the (tenantId,
 * userId) pair. A subscriber whose `send` throws is removed from
 * the set so a crashing client connection can't poison the bus.
 */
export function publishNotificationEvent(
    tenantId: string,
    userId: string,
    event: NotificationEvent,
): void {
    for (const sub of subscribers) {
        if (sub.tenantId !== tenantId) continue;
        if (sub.userId !== userId) continue;
        try {
            sub.send(event);
        } catch {
            // Crashing subscriber — drop it so we don't keep
            // retrying. The client will reconnect on its own.
            subscribers.delete(sub);
        }
    }
}

/**
 * Test-only helper. Production code never needs this — production
 * subscribers always come and go via the SSE route's lifetime.
 */
export function __resetNotificationBusForTests(): void {
    subscribers.clear();
}

/**
 * Diagnostic — current subscriber count. Useful for tests + the
 * `/api/health` surface if we ever want to expose connection
 * counts.
 */
export function getNotificationSubscriberCount(): number {
    return subscribers.size;
}
