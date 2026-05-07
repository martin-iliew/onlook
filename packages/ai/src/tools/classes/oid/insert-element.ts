import { Icons } from '@onlook/ui/icons';
import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import { CodeActionType } from '@onlook/models';
import { z } from 'zod';
import { ClientTool } from '../../models/client';
import { BRANCH_ID_SCHEMA, OID_SCHEMA, baseDiffRequest, writeOidRequests } from './helpers';

const generateOid = () => Math.random().toString(36).slice(2, 10);

export class OidInsertElementTool extends ClientTool {
    static readonly toolName = 'oid_insert_element';
    static readonly description =
        'Insert a new JSX child into a parent element identified by its data-oid. ' +
        'Provide either codeBlock (raw JSX) or tagName + attributes.';
    static readonly parameters = z.object({
        parentOid: OID_SCHEMA.describe('data-oid of the parent element'),
        branchId: BRANCH_ID_SCHEMA,
        codeBlock: z.string().optional().describe('Raw JSX string to insert (preferred over tagName)'),
        tagName: z.string().optional().describe('HTML/component tag name (used when no codeBlock)'),
        attributes: z.record(z.string(), z.string()).optional().describe('Props for the new element'),
        textContent: z.string().optional().describe('Text content for the new element'),
        position: z
            .union([z.enum(['append', 'prepend']), z.number().int()])
            .optional()
            .describe('"append" (default), "prepend", or integer child index'),
    });
    static readonly icon = Icons.Plus;

    async handle(
        args: z.infer<typeof OidInsertElementTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const newOid = generateOid();
        const pos = args.position ?? 'append';
        const location =
            typeof pos === 'number'
                ? { type: 'index' as const, index: pos, originalIndex: pos, targetDomId: '', targetOid: null }
                : { type: (pos === 'prepend' ? 'prepend' : 'append') as 'prepend' | 'append', targetDomId: '', targetOid: null };

        const req = baseDiffRequest(args.parentOid, args.branchId, {
            structureChanges: [{
                type: CodeActionType.INSERT,
                oid: newOid,
                location,
                tagName: args.tagName ?? 'div',
                attributes: args.attributes ?? {},
                textContent: args.textContent ?? null,
                pasteParams: null,
                codeBlock: args.codeBlock ?? null,
                children: [],
            }],
        });
        return writeOidRequests([req], editorEngine);
    }

    static getLabel(input?: z.infer<typeof OidInsertElementTool.parameters>): string {
        return input?.parentOid ? `Inserting into ${input.parentOid.slice(0, 8)}…` : 'Inserting element';
    }
}
