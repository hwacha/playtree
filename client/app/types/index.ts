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

type Song = {
    filename: string;
}

type PlayEdge = {
    nodeID: string;
    shares: number;
    repeat: number;
}

type PlayNode = {
    id: string;
    type: "song";
    content: Song;
    next: PlayEdge[];
}

type PlayheadInfo = {
    name: string;
    nodeID: string;
}

type Playhead = {
    name: string;
    node: PlayNode;
    history: PlayNode[];
}

type Playtree = {
    summary: PlaytreeSummary;
    nodes: PlayNode[];
    playroots: PlayheadInfo[];
}
