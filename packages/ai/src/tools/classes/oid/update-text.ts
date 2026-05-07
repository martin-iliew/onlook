import { Icons } from '@onlook/ui/icons';
import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import { z } from 'zod';
import { ClientTool } from '../../models/client';
import { BRANCH_ID_SCHEMA, OID_SCHEMA, baseDiffRequest, writeOidRequests } from './helpers';

export class OidUpdateTextTool extends ClientTool {
    static readonly toolName = 'oid_update_element_text';
    static readonly description =
        'Replace the text content of a JSX element identified by its data-oid attribute. ' +
        'Provides instant visual update via AST mutation.';
    static readonly parameters = z.object({
        oid: OID_SCHEMA,
        branchId: BRANCH_ID_SCHEMA,
        textContent: z.string().describe('New text content for the element'),
    });
    static readonly icon = Icons.Text;

    async handle(
        args: z.infer<typeof OidUpdateTextTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const req = baseDiffRequest(args.oid, args.branchId, {
            textContent: args.textContent,
        });
        return writeOidRequests([req], editorEngine);
    }

    static getLabel(input?: z.infer<typeof OidUpdateTextTool.parameters>): string {
        return input?.oid ? `Updating text on ${input.oid.slice(0, 8)}…` : 'Updating text';
    }
}
