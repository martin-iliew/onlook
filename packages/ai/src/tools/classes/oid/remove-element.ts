import { Icons } from '@onlook/ui/icons';
import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import { CodeActionType } from '@onlook/models';
import { z } from 'zod';
import { ClientTool } from '../../models/client';
import { BRANCH_ID_SCHEMA, OID_SCHEMA, baseDiffRequest, writeOidRequests } from './helpers';

export class OidRemoveElementTool extends ClientTool {
    static readonly toolName = 'oid_remove_element';
    static readonly description =
        'Remove a JSX element from the DOM tree by its data-oid. ' +
        'The element is removed from its parent.';
    static readonly parameters = z.object({
        oid: OID_SCHEMA,
        branchId: BRANCH_ID_SCHEMA,
    });
    static readonly icon = Icons.Trash;

    async handle(
        args: z.infer<typeof OidRemoveElementTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const req = baseDiffRequest(args.oid, args.branchId, {
            structureChanges: [{
                type: CodeActionType.REMOVE,
                oid: args.oid,
                codeBlock: null,
            }],
        });
        return writeOidRequests([req], editorEngine);
    }

    static getLabel(input?: z.infer<typeof OidRemoveElementTool.parameters>): string {
        return input?.oid ? `Removing ${input.oid.slice(0, 8)}…` : 'Removing element';
    }
}
