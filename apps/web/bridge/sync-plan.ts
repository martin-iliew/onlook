export interface TextSyncPlan {
    nextContent: string
    shouldWriteLocal: boolean
    shouldWriteRemote: boolean
}

export function getTextSyncPlan({
    localContent,
    finalContent,
    lastSyncedContent,
}: {
    localContent: string
    finalContent: string
    lastSyncedContent?: string
}): TextSyncPlan {
    return {
        nextContent: finalContent,
        shouldWriteLocal: localContent !== finalContent,
        shouldWriteRemote: lastSyncedContent !== finalContent,
    }
}
