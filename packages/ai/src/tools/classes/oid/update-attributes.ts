import { Icons } from '@onlook/ui/icons';
import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import { z } from 'zod';
import { ClientTool } from '../../models/client';
import { BRANCH_ID_SCHEMA, OID_SCHEMA, baseDiffRequest, writeOidRequests } from './helpers';

export class OidUpdateAttributesTool extends ClientTool {
    static readonly toolName = 'oid_update_element_attributes';
    static readonly description =
        'Set arbitrary JSX props on an element by data-oid. ' +
        'Use for non-className attributes such as href, src, alt, aria-*, data-* etc.';
    static readonly parameters = z.object({
        oid: OID_SCHEMA,
        branchId: BRANCH_ID_SCHEMA,
        attributes: z
            .record(z.string(), z.string())
            .describe('Key-value pairs of JSX props to set on the element'),
    });
    static readonly icon = Icons.Code;

    async handle(
        args: z.infer<typeof OidUpdateAttributesTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const req = baseDiffRequest(args.oid, args.branchId, {
            attributes: args.attributes,
        });
        return writeOidRequests([req], editorEngine);
    }

    static getLabel(input?: z.infer<typeof OidUpdateAttributesTool.parameters>): string {
        return input?.oid ? `Updating attrs on ${input.oid.slice(0, 8)}…` : 'Updating attributes';
    }
}
