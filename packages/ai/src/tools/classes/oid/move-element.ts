import { Icons } from '@onlook/ui/icons';
import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import { CodeActionType } from '@onlook/models';
import { z } from 'zod';
import { ClientTool } from '../../models/client';
import { BRANCH_ID_SCHEMA, OID_SCHEMA, baseDiffRequest, writeOidRequests } from './helpers';

export class OidMoveElementTool extends ClientTool {
    static readonly toolName = 'oid_move_element';
    static readonly description =
        'Reorder a child JSX element within its parent container. ' +
        'Provide the parent data-oid, the child data-oid to move, and the target 0-based index.';
    static readonly parameters = z.object({
        parentOid: OID_SCHEMA.describe('data-oid of the parent container element'),
        childOid: OID_SCHEMA.describe('data-oid of the child element to reorder'),
        branchId: BRANCH_ID_SCHEMA,
        newIndex: z.number().int().min(0).describe('0-based target index within the parent children'),
    });
    static readonly icon = Icons.DragHandleDots;

    async handle(
        args: z.infer<typeof OidMoveElementTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const req = baseDiffRequest(args.parentOid, args.branchId, {
            structureChanges: [{
                type: CodeActionType.MOVE,
                oid: args.childOid,
                location: {
                    type: 'index',
                    index: args.newIndex,
                    originalIndex: args.newIndex,
                    targetDomId: '',
                    targetOid: null,
                },
            }],
        });
        return writeOidRequests([req], editorEngine);
    }

    static getLabel(input?: z.infer<typeof OidMoveElementTool.parameters>): string {
        return input?.childOid ? `Moving ${input.childOid.slice(0, 8)}…` : 'Moving element';
    }
}
