import { Playcounters } from "../components/Player";

export type PlaytreeSummary = {
	id: string;
	name: string;
	createdBy: string;
	access: "public" | "private"
}

export type PlayitemType = {
	source: "local" | "spotify" | "youtube",
	plurality: "single" | "collection"
}

export type Playitem = {
	id: string;
	type: PlayitemType;
	uri: string;
	name: string;
	multiplier: number;
	limit: number;
}

export type Playedge = {
	targetID: string;
	priority: number;
	shares: number;
	limit: number;
}

export type Playnode = {
	id: string;
	type: "sequencer" | "selector" | "simulplexer";
	name: string;
	limit: number;
	playscopes: number[];
	playitems: Playitem[];
	next: Playedge[];
}

export type HistoryNode = {
	playnodeID: string;
	index: number;
	multIndex: number;
	traversedPlayedge: Playedge | null;
	cachedPlaycounters: Playcounters | null;
}

export type Playroot = {
	index: number;
	name: string;
}

export type Playscope = {
	name: string;
	color: string;
}

export const makeDefaultPlayscope = () : Playscope => {
	return {
		name: "default",
		color: "white"
	}
}

export type Playtree = {
	summary: PlaytreeSummary;
	playnodes: Map<string, Playnode>;
	playroots: Map<string, Playroot>;
	playscopes: Playscope[];
}

export const playtreeFromJson = (playtreeWithNodesAsJSObject: { summary: PlaytreeSummary, playnodes: { [key: string]: Playnode }, playroots: { [key: string]: Playroot }, playscopes: Playscope[] }): Playtree | null => {
	if (playtreeWithNodesAsJSObject) {
		return {
			...playtreeWithNodesAsJSObject,
			playnodes: new Map(Object.entries(playtreeWithNodesAsJSObject.playnodes)),
			playroots: new Map(Object.entries(playtreeWithNodesAsJSObject.playroots)),
		}
	}

	return null
}

export const jsonFromPlaytree = (playtree: Playtree): { summary: PlaytreeSummary, playnodes: { [key: string]: Playnode }, playroots: { [key: string]: Playroot }, playscopes: Playscope[] } => {
	return {
		...playtree,
		playnodes: Object.fromEntries(playtree.playnodes.entries()),
		playroots: Object.fromEntries(playtree.playroots.entries())
	}
}
