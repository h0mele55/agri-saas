/**
 * Ag field-workflow automation emits must stay wired.
 *
 * Mirrors `automation-domain-emits.test.ts`: the three ag events the
 * observability epic surfaced (SPRAY_JOB_STARTED, OPERATION_PARCEL_MARKED,
 * HARVEST_YIELD_RECORDED) must remain (a) in the subscribable catalog,
 * (b) in the builder-UI labels, and (c) emitted at their producer sites
 * via `emitAutomationEvent`. A refactor that drops any leg silently
 * breaks "build a rule that triggers on a field workflow" — caught here.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const AG_EVENTS = ['SPRAY_JOB_STARTED', 'OPERATION_PARCEL_MARKED', 'HARVEST_YIELD_RECORDED'] as const;

describe('ag field-workflow automation emits', () => {
    it('all three ag events are in the catalog + builder labels', () => {
        const events = read('src/app-layer/automation/events.ts');
        const labels = read('src/lib/automation/event-labels.ts');
        const contracts = read('src/app-layer/automation/event-contracts.ts');
        for (const ev of AG_EVENTS) {
            expect(events).toContain(ev);
            expect(labels).toContain(ev);
            // every catalog entry must carry a typed contract variant
            expect(contracts).toContain(`event: '${ev}'`);
        }
    });

    it('the ag events group under the "Field operations" builder domain', () => {
        const labels = read('src/lib/automation/event-labels.ts');
        expect(labels).toContain("'Field operations'");
    });

    it('createFieldOperation emits SPRAY_JOB_STARTED', () => {
        const src = read('src/app-layer/usecases/field-operation.ts');
        expect(src).toMatch(/emitAutomationEvent\(/);
        expect(src).toMatch(/event: 'SPRAY_JOB_STARTED'/);
    });

    it('markOperationParcel emits OPERATION_PARCEL_MARKED', () => {
        const src = read('src/app-layer/usecases/field-operation.ts');
        expect(src).toMatch(/event: 'OPERATION_PARCEL_MARKED'/);
    });

    it('createYieldRecord emits HARVEST_YIELD_RECORDED', () => {
        const src = read('src/app-layer/usecases/yield-record.ts');
        expect(src).toMatch(/emitAutomationEvent\(/);
        expect(src).toMatch(/event: 'HARVEST_YIELD_RECORDED'/);
    });
});
