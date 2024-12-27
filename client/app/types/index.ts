type UserInfo = {
    id: string;
    name: string;
}

type SourceInfo = {
    type: "graft" | "starter"
    id: string
}

type PlaytreeSummary = {
    id: string;
    name: string;
    createdBy: UserInfo;
    SourceInfo: SourceInfo | null;
}

type Content = {
    type: "local-audio" | "spotify-track" | "spotify-playlist";
    uri: string;
}

type PlayEdge = {
    nodeID: string;
    shares: number;
    repeat: number;
}

type PlayNode = {
    id: string;
    type: "sequence"|"selector";
    content: Content[];
    next: PlayEdge[];
}

type HistoryNode = {
    nodeID: string;
    index: number;
}

type PlayheadInfo = {
    name: string;
    nodeID: string;
}

type Playhead = {
    name: string;
    node: PlayNode;
    nodeIndex: number;
    history: HistoryNode[];
}

type Playtree = {
    summary: PlaytreeSummary;
    nodes: PlayNode[];
    playroots: PlayheadInfo[];
}
