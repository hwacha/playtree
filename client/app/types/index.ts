export type SourceInfo = {
    type: "graft" | "starter"
    id: string
}

export type PlaytreeSummary = {
    id: string;
    name: string;
    createdBy: string;
    SourceInfo: SourceInfo | null;
}

export type Content = {
    type: "local-audio" | "spotify-track" | "spotify-playlist";
    uri: string;
}

export type PlayEdge = {
    nodeID: string;
    shares: number;
    repeat: number;
}

export type PlayNode = {
    id: string;
    name: string;
    type: "sequence"|"selector";
    content: Content[];
    next: PlayEdge[];
}

export type HistoryNode = {
    nodeID: string;
    index: number;
}

export type PlayheadInfo = {
    name: string;
    nodeID: string;
}

export type Playhead = {
    name: string;
    node: PlayNode;
    nodeIndex: number;
    history: HistoryNode[];
}

export type Playtree = {
    summary: PlaytreeSummary;
    nodes: Map<string, PlayNode>;
    playroots: PlayheadInfo[];
}

export const playtreeFromJson = (playtreeWithNodesAsJSObject : {summary: PlaytreeSummary, nodes: {[key:string]: PlayNode}, playroots: PlayheadInfo[]}) : Playtree | null => {
    if (playtreeWithNodesAsJSObject) {
        return {
            ...playtreeWithNodesAsJSObject,
            nodes: new Map(Object.entries(playtreeWithNodesAsJSObject.nodes))
        }
    }

    return null
}

export const jsonFromPlaytree = (playtree : Playtree) : {summary: PlaytreeSummary, nodes: {[key:string]: PlayNode}, playroots: PlayheadInfo[]} => {
    return {
        ...playtree,
        nodes: Object.fromEntries(playtree.nodes.entries())
    }
}
