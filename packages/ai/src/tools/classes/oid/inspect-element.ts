import { Icons } from '@onlook/ui/icons';
import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import { z } from 'zod';
import { ClientTool } from '../../models/client';
import { BRANCH_ID_SCHEMA, OID_SCHEMA } from './helpers';

export class OidInspectElementTool extends ClientTool {
    static readonly toolName = 'oid_inspect_element';
    static readonly description =
        'Look up source information for a JSX element by its data-oid. ' +
        'Returns file path, component name, and source position.';
    static readonly parameters = z.object({
        oid: OID_SCHEMA,
        branchId: BRANCH_ID_SCHEMA,
    });
    static readonly icon = Icons.MagnifyingGlass;

    async handle(
        args: z.infer<typeof OidInspectElementTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const branchData = editorEngine.branches.getBranchDataById(args.branchId);
        const codeEditor = branchData?.codeEditor ?? editorEngine.fileSystem;
        const metadata = await codeEditor.getJsxElementMetadata(args.oid);

        if (!metadata) {
            return `OID ${args.oid} not found in the file index. ` +
                'The element may not be in a scanned file, or the index may need rebuilding.';
        }

        const result = {
            oid: args.oid,
            filePath: metadata.path,
            component: metadata.component,
            startLine: metadata.startTag.start.line,
            endLine: (metadata.endTag ?? metadata.startTag).end.line,
            code: metadata.code?.slice(0, 400),
        };
        return JSON.stringify(result, null, 2);
    }

    static getLabel(input?: z.infer<typeof OidInspectElementTool.parameters>): string {
        return input?.oid ? `Inspecting ${input.oid.slice(0, 8)}…` : 'Inspecting element';
    }
}
