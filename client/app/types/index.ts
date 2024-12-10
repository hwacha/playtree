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
    path: string;
}

type RepeatInfo = {
    times: number;
    from: string;
    counter: number | undefined;
}

type NodeProbability = {
    node: string;
    probability: number | null | undefined;
}


type PlaytreeNode = {
    id: string;
    type: "song";
    content: Song;
    repeat: RepeatInfo | null;
    next: NodeProbability[];
}

type PlayheadInfo = {
    name: string;
    nodeID: string;
}

type Playhead = {
    name: string;
    node: PlaytreeNode;
    history: PlaytreeNode[];
}

type Playtree = {
    summary: PlaytreeSummary;
    nodes: PlaytreeNode[];
    playheads: PlayheadInfo[];
}
