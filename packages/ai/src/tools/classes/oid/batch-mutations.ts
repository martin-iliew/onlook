import { Icons } from '@onlook/ui/icons';
import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import { CodeActionType, type CodeDiffRequest } from '@onlook/models';
import { z } from 'zod';
import { ClientTool } from '../../models/client';
import { BRANCH_ID_SCHEMA, baseDiffRequest, writeOidRequests } from './helpers';

const generateOid = () => Math.random().toString(36).slice(2, 10);

const MutationSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('style'),
        oid: z.string(),
        branchId: z.string(),
        classes: z.string(),
        overrideClasses: z.boolean().optional(),
    }),
    z.object({
        type: z.literal('text'),
        oid: z.string(),
        branchId: z.string(),
        textContent: z.string(),
    }),
    z.object({
        type: z.literal('attributes'),
        oid: z.string(),
        branchId: z.string(),
        attributes: z.record(z.string(), z.string()),
    }),
    z.object({
        type: z.literal('remove'),
        oid: z.string(),
        branchId: z.string(),
    }),
    z.object({
        type: z.literal('insert'),
        parentOid: z.string(),
        branchId: z.string(),
        codeBlock: z.string().optional(),
        tagName: z.string().optional(),
        attributes: z.record(z.string(), z.string()).optional(),
        textContent: z.string().optional(),
        position: z.union([z.enum(['append', 'prepend']), z.number().int()]).optional(),
    }),
    z.object({
        type: z.literal('move'),
        parentOid: z.string(),
        childOid: z.string(),
        branchId: z.string(),
        newIndex: z.number().int().min(0),
    }),
]);

export class OidBatchMutationsTool extends ClientTool {
    static readonly toolName = 'oid_batch_mutations';
    static readonly description =
        'Apply multiple OID mutations atomically, grouped per file in a single AST pass. ' +
        'Preferred when making several changes to elements in the same file. ' +
        'Each mutation must have a "type" field: style | text | attributes | remove | insert | move.';
    static readonly parameters = z.object({
        branchId: BRANCH_ID_SCHEMA,
        mutations: z.array(MutationSchema).describe('Array of mutation objects'),
    });
    static readonly icon = Icons.MixerHorizontal;

    async handle(
        args: z.infer<typeof OidBatchMutationsTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const requests: CodeDiffRequest[] = [];

        for (const m of args.mutations) {
            switch (m.type) {
                case 'style':
                    requests.push(baseDiffRequest(m.oid, m.branchId, {
                        attributes: { className: m.classes },
                        overrideClasses: m.overrideClasses ?? false,
                    }));
                    break;
                case 'text':
                    requests.push(baseDiffRequest(m.oid, m.branchId, {
                        textContent: m.textContent,
                    }));
                    break;
                case 'attributes':
                    requests.push(baseDiffRequest(m.oid, m.branchId, {
                        attributes: m.attributes,
                    }));
                    break;
                case 'remove':
                    requests.push(baseDiffRequest(m.oid, m.branchId, {
                        structureChanges: [{ type: CodeActionType.REMOVE, oid: m.oid, codeBlock: null }],
                    }));
                    break;
                case 'insert': {
                    const newOid = generateOid();
                    const pos = m.position ?? 'append';
                    const location = typeof pos === 'number'
                        ? { type: 'index' as const, index: pos, originalIndex: pos, targetDomId: '', targetOid: null }
                        : { type: (pos === 'prepend' ? 'prepend' : 'append') as 'prepend' | 'append', targetDomId: '', targetOid: null };
                    requests.push(baseDiffRequest(m.parentOid, m.branchId, {
                        structureChanges: [{
                            type: CodeActionType.INSERT,
                            oid: newOid,
                            location,
                            tagName: m.tagName ?? 'div',
                            attributes: m.attributes ?? {},
                            textContent: m.textContent ?? null,
                            pasteParams: null,
                            codeBlock: m.codeBlock ?? null,
                            children: [],
                        }],
                    }));
                    break;
                }
                case 'move':
                    requests.push(baseDiffRequest(m.parentOid, m.branchId, {
                        structureChanges: [{
                            type: CodeActionType.MOVE,
                            oid: m.childOid,
                            location: {
                                type: 'index',
                                index: m.newIndex,
                                originalIndex: m.newIndex,
                                targetDomId: '',
                                targetOid: null,
                            },
                        }],
                    }));
                    break;
            }
        }

        return writeOidRequests(requests, editorEngine);
    }

    static getLabel(input?: z.infer<typeof OidBatchMutationsTool.parameters>): string {
        const count = input?.mutations?.length ?? 0;
        return count > 0 ? `Applying ${count} mutations` : 'Applying mutations';
    }
}
