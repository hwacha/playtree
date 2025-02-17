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
    id: string;
    type: "local-audio" | "spotify-track" | "spotify-playlist";
    uri: string;
    mult: number;
    repeat: number;
}

export type PlayEdge = {
    nodeID: string;
    shares: number;
    priority: number;
    repeat: number;
}

export type PlayNode = {
    id: string;
    name: string;
    type: "sequence"|"selector";
    repeat: number;
    content: Content[];
    next: PlayEdge[];
}

export type HistoryNode = {
    nodeID: string;
    index: number;
    multIndex: number;
    traversedPlayedge: PlayEdge | null;
}

export type PlayheadInfo = {
    index: number;
    name: string;
}

export type Playhead = {
    name: string;
    node: PlayNode;
    nodeIndex: number;
    multIndex: number;
    history: HistoryNode[];
    stopped: boolean;
}

export type Playtree = {
    summary: PlaytreeSummary;
    nodes: Map<string, PlayNode>;
    playroots: Map<string, PlayheadInfo>;
}

export const playtreeFromJson = (playtreeWithNodesAsJSObject : {summary: PlaytreeSummary, nodes: {[key:string]: PlayNode}, playroots: {[key:string]: PlayheadInfo}}) : Playtree | null => {
    if (playtreeWithNodesAsJSObject) {
        return {
            ...playtreeWithNodesAsJSObject,
            nodes: new Map(Object.entries(playtreeWithNodesAsJSObject.nodes)),
            playroots: new Map(Object.entries(playtreeWithNodesAsJSObject.playroots))
        }
    }

    return null
}

export const jsonFromPlaytree = (playtree : Playtree) : {summary: PlaytreeSummary, nodes: {[key:string]: PlayNode}, playroots: {[key:string]: PlayheadInfo}} => {
    return {
        ...playtree,
        nodes: Object.fromEntries(playtree.nodes.entries()),
        playroots: Object.fromEntries(playtree.playroots.entries())
    }
}
