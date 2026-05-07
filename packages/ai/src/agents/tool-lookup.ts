import { BashEditTool, BashReadTool, CheckErrorsTool, FuzzyEditFileTool, GlobTool, GrepTool, ListBranchesTool, ListFilesTool, OidBatchMutationsTool, OidInspectElementTool, OidInsertElementTool, OidMoveElementTool, OidRemoveElementTool, OidUpdateAttributesTool, OidUpdateStyleTool, OidUpdateTextTool, OnlookInstructionsTool, ReadFileTool, ReadStyleGuideTool, SandboxTool, ScrapeUrlTool, SearchReplaceEditTool, SearchReplaceMultiEditFileTool, TerminalCommandTool, TypecheckTool, WebSearchTool, WriteFileTool } from "../tools";

export const allTools = [
    ListFilesTool,
    ReadFileTool,
    BashReadTool,
    OnlookInstructionsTool,
    ReadStyleGuideTool,
    ListBranchesTool,
    ScrapeUrlTool,
    WebSearchTool,
    GlobTool,
    GrepTool,
    TypecheckTool,
    CheckErrorsTool,
    SearchReplaceEditTool,
    SearchReplaceMultiEditFileTool,
    FuzzyEditFileTool,
    WriteFileTool,
    BashEditTool,
    SandboxTool,
    TerminalCommandTool,
    OidUpdateStyleTool,
    OidUpdateTextTool,
    OidUpdateAttributesTool,
    OidInsertElementTool,
    OidRemoveElementTool,
    OidMoveElementTool,
    OidInspectElementTool,
    OidBatchMutationsTool,
];

export const readOnlyRootTools = [
    ListFilesTool,
    ReadFileTool,
    BashReadTool,
    OnlookInstructionsTool,
    ReadStyleGuideTool,
    ListBranchesTool,
    ScrapeUrlTool,
    WebSearchTool,
    GlobTool,
    GrepTool,
    TypecheckTool,
    CheckErrorsTool,
]
const editOnlyRootTools = [
    SearchReplaceEditTool,
    SearchReplaceMultiEditFileTool,
    FuzzyEditFileTool,
    WriteFileTool,
    BashEditTool,
    SandboxTool,
    TerminalCommandTool,
    OidUpdateStyleTool,
    OidUpdateTextTool,
    OidUpdateAttributesTool,
    OidInsertElementTool,
    OidRemoveElementTool,
    OidMoveElementTool,
    OidInspectElementTool,
    OidBatchMutationsTool,
]

export const rootTools = [...readOnlyRootTools, ...editOnlyRootTools];

export const userTools = [
    ListBranchesTool,
    ListFilesTool,
]
