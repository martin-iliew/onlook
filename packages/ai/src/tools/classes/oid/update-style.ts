import { Icons } from '@onlook/ui/icons';
import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import { z } from 'zod';
import { ClientTool } from '../../models/client';
import { BRANCH_ID_SCHEMA, OID_SCHEMA, baseDiffRequest, writeOidRequests } from './helpers';

export class OidUpdateStyleTool extends ClientTool {
    static readonly toolName = 'oid_update_element_style';
    static readonly description =
        'Update Tailwind CSS classes on a JSX element identified by its data-oid attribute. ' +
        'Provides instant visual update via AST mutation — same path as the visual editor.';
    static readonly parameters = z.object({
        oid: OID_SCHEMA,
        branchId: BRANCH_ID_SCHEMA,
        classes: z.string().describe('Space-separated Tailwind classes to apply'),
        overrideClasses: z
            .boolean()
            .optional()
            .describe('Replace all existing classes (true) or merge/add (false). Defaults to false.'),
    });
    static readonly icon = Icons.Pencil;

    async handle(
        args: z.infer<typeof OidUpdateStyleTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const req = baseDiffRequest(args.oid, args.branchId, {
            attributes: { className: args.classes },
            overrideClasses: args.overrideClasses ?? false,
        });
        return writeOidRequests([req], editorEngine);
    }

    static getLabel(input?: z.infer<typeof OidUpdateStyleTool.parameters>): string {
        return input?.oid ? `Styling ${input.oid.slice(0, 8)}…` : 'Updating style';
    }
}
