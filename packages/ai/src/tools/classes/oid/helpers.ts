import type { EditorEngine } from '@onlook/web-client/src/components/store/editor/engine';
import type { CodeDiffRequest } from '@onlook/models';
import { BRANCH_ID_SCHEMA } from '../../shared/type';
import { z } from 'zod';

export { BRANCH_ID_SCHEMA };

export const OID_SCHEMA = z.string().describe('The data-oid attribute of the target JSX element');

/** Build a CodeDiffRequest with all optional fields defaulted to no-op. */
export function baseDiffRequest(
    oid: string,
    branchId: string,
    overrides: Partial<CodeDiffRequest> = {},
): CodeDiffRequest {
    return {
        oid,
        branchId,
        attributes: {},
        textContent: null,
        overrideClasses: null,
        structureChanges: [],
        ...overrides,
    };
}

/** Submit requests through the normal visual-editor code path and return a status string. */
export async function writeOidRequests(
    requests: CodeDiffRequest[],
    editorEngine: EditorEngine,
): Promise<string> {
    await editorEngine.code.writeRequest(requests);
    const oids = requests.map((r) => r.oid).join(', ');
    return `Applied ${requests.length} mutation(s) on oid(s): ${oids}`;
}
