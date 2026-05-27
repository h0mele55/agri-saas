/**
 * 2026-05-27 — Unit coverage for the in-process notification bus
 * (PR-C). Locks the (tenant, user) filtering contract + the
 * subscriber-cleanup invariant.
 */

import {
    subscribeToNotifications,
    publishNotificationEvent,
    getNotificationSubscriberCount,
    __resetNotificationBusForTests,
    type NotificationEvent,
} from '@/lib/notifications/notification-bus';

const sampleEvent: NotificationEvent = {
    id: 'evt-1',
    type: 'TASK_DUE',
    title: 'Test',
    message: 'msg',
    read: false,
    linkUrl: null,
    createdAt: '2026-05-27T12:00:00Z',
};

beforeEach(() => {
    __resetNotificationBusForTests();
});

describe('notification bus', () => {
    it('publishes to subscribers matching (tenant, user)', () => {
        const received: NotificationEvent[] = [];
        const unsubscribe = subscribeToNotifications({
            tenantId: 'tenant-1',
            userId: 'user-1',
            send: (e) => received.push(e),
        });

        publishNotificationEvent('tenant-1', 'user-1', sampleEvent);
        expect(received).toHaveLength(1);
        expect(received[0]).toEqual(sampleEvent);

        unsubscribe();
    });

    it('does NOT publish to subscribers in a different tenant', () => {
        const received: NotificationEvent[] = [];
        const unsub = subscribeToNotifications({
            tenantId: 'tenant-1',
            userId: 'user-1',
            send: (e) => received.push(e),
        });
        // Same user id but different tenant — must NOT fan out.
        publishNotificationEvent('tenant-OTHER', 'user-1', sampleEvent);
        expect(received).toHaveLength(0);
        unsub();
    });

    it('does NOT publish to subscribers in the same tenant but different user', () => {
        const received: NotificationEvent[] = [];
        const unsub = subscribeToNotifications({
            tenantId: 'tenant-1',
            userId: 'user-1',
            send: (e) => received.push(e),
        });
        publishNotificationEvent('tenant-1', 'user-OTHER', sampleEvent);
        expect(received).toHaveLength(0);
        unsub();
    });

    it('publishes to multiple subscribers for the same (tenant, user)', () => {
        // Two tabs open by the same user — both should see the event.
        const r1: NotificationEvent[] = [];
        const r2: NotificationEvent[] = [];
        const u1 = subscribeToNotifications({
            tenantId: 'tenant-1',
            userId: 'user-1',
            send: (e) => r1.push(e),
        });
        const u2 = subscribeToNotifications({
            tenantId: 'tenant-1',
            userId: 'user-1',
            send: (e) => r2.push(e),
        });

        publishNotificationEvent('tenant-1', 'user-1', sampleEvent);
        expect(r1).toHaveLength(1);
        expect(r2).toHaveLength(1);
        u1();
        u2();
    });

    it('unsubscribe removes the subscriber', () => {
        const received: NotificationEvent[] = [];
        const unsubscribe = subscribeToNotifications({
            tenantId: 'tenant-1',
            userId: 'user-1',
            send: (e) => received.push(e),
        });
        expect(getNotificationSubscriberCount()).toBe(1);

        unsubscribe();
        expect(getNotificationSubscriberCount()).toBe(0);

        publishNotificationEvent('tenant-1', 'user-1', sampleEvent);
        expect(received).toHaveLength(0);
    });

    it('drops a subscriber whose send() throws (poison-pill recovery)', () => {
        // A crashing subscriber (e.g. controller closed mid-flush)
        // MUST be removed so the bus stays healthy for the rest.
        const surviving: NotificationEvent[] = [];
        const u1 = subscribeToNotifications({
            tenantId: 'tenant-1',
            userId: 'user-1',
            send: () => {
                throw new Error('boom');
            },
        });
        const u2 = subscribeToNotifications({
            tenantId: 'tenant-1',
            userId: 'user-1',
            send: (e) => surviving.push(e),
        });

        publishNotificationEvent('tenant-1', 'user-1', sampleEvent);

        // The healthy subscriber received the event.
        expect(surviving).toHaveLength(1);
        // The crashing one was dropped.
        expect(getNotificationSubscriberCount()).toBe(1);

        u1();
        u2();
    });
});
