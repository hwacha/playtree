import { diff, intersection, isSupersetOf, union } from "@opentf/std";
import { Playedge, Playnode, Playroot, Playtree } from "../types";

export type Playcounters = {
	// scope ID -> node ID -> content ID -> playcount
	playitems: Map<number, Map<string, Map<string, number>>>;
	// scope ID -> node ID -> playcount
	playnodes: Map<number, Map<string, number>>;
	// scope ID -> source node ID -> target node ID -> playcount
	playedges: Map<number, Map<string, Map<string, number>>>;
}

const makeNewPlaycounters = () : Playcounters => {
	return {
		playitems: new Map<number, Map<string, Map<string, number>>>(),
		playnodes: new Map<number, Map<string, number>>(),
		playedges: new Map<number, Map<string, Map<string, number>>>()
	}
}

const zeroCounter = (counter: Map<string, number>) : Map<string, number> => {
	const newCounter = new Map<string, number>()
	const keysIter = counter.keys()
	for (let key = keysIter.next(); !key.done; key = keysIter.next()) {
		newCounter.set(key.value, 0)
	}
	return newCounter
}

const zeroPlaycountersAtScope = (playcounters: Playcounters, scopeID: number): Playcounters => {
	const newPlaycounters = structuredClone(playcounters)
	if (newPlaycounters.playitems.has(scopeID)) {
		const newContentPlaycounter = new Map<string, Map<string, number>>()
		const contentKeysIter : MapIterator<string> = playcounters.playitems.get(scopeID)?.keys() as MapIterator<string>
		playcounters.playitems.get(scopeID)
		for (let key = contentKeysIter.next(); !key.done; key = contentKeysIter.next()) {
			newContentPlaycounter.set(key.value, zeroCounter(playcounters.playitems.get(scopeID)?.get(key.value) as Map<string, number>))
		}
		newPlaycounters.playitems.set(scopeID, newContentPlaycounter)
	}

	if (newPlaycounters.playnodes.has(scopeID)) {
		const newNodePlaycounter = zeroCounter(newPlaycounters.playnodes.get(scopeID) as Map<string, number>)
		newPlaycounters.playnodes.set(scopeID, newNodePlaycounter)
	}

	if (newPlaycounters.playedges.has(scopeID)) {
		const newEdgePlaycounter = new Map<string, Map<string, number>>()
		const edgeKeysIter : MapIterator<string> = playcounters.playedges.get(scopeID)?.keys() as MapIterator<string>
		for (let key = edgeKeysIter.next(); !key.done; key = edgeKeysIter.next()) {
			newEdgePlaycounter.set(key.value, zeroCounter(playcounters.playedges.get(scopeID)?.get(key.value) as Map<string, number>))
		}
		newPlaycounters.playedges.set(scopeID, newEdgePlaycounter)
	}

	return newPlaycounters
}

const zeroPlaycounters = (playcounters: Playcounters): Playcounters => {
	const relevantScopes : number[] = union([
		Array.from(playcounters.playitems.keys()),
		Array.from(playcounters.playnodes.keys()),
		Array.from(playcounters.playedges.keys())]) as number[]

	let newPlaycounters = playcounters
	relevantScopes.forEach(scopeID => {
		newPlaycounters = zeroPlaycountersAtScope(newPlaycounters, scopeID)
	})

	return newPlaycounters
}

export type HistoryNode = {
	playnodeID: string;
	index: number;
	multIndex: number;
	traversedPlayedge: Playedge | null;
	cachedPlaycounters: Playcounters | null;
}

export type Playhead = {
	name: string;
	node: Playnode;
	nodeIndex: number;
	multIndex: number;
	history: HistoryNode[];
	shouldHideNode: boolean;
	shouldHideSong: boolean;
	
	playcounters: Playcounters;

	stopped: boolean;
	spotifyPlaybackPosition_ms: number;
}

type PlayerState = {
	playheads: Playhead[];
	playheadIndex: number;

	leastScopeByNode: Map<string, number>;
	leastScopeByEdge: Map<string, Map<string, number>>;

	messageLog: string[];

	spotifyPlayerReady: boolean;

	playing: boolean;
	autoplay: boolean;
}

type PlayerAction = {
	type: 'spotify_player_ready' | 'played' | 'paused';
} | {
	type: 'skipped_backward' | 'incremented_playhead' | 'decremented_playhead';
	playtree: Playtree;
} | {
	type: 'playtree_loaded';
	playtree: Playtree;
	selectorRand: number;
	autoplay?: boolean;
} | {
	type: 'song_ended' | 'skipped_forward';
	playtree: Playtree;
	selectorRand: number;
	edgeRand: number;
} | {
	type: 'autoplay_set';
	autoplay: boolean;
} | {
	type: 'song_progress_received';
	spotifyPlaybackPosition_ms: number;
} | {
	type: 'message_logged';
	message: string;
}

const reducer = (state: PlayerState, action: PlayerAction): PlayerState => {
	switch (action.type) {
		case 'playtree_loaded': {
			const playnodesArray = Array.from(action.playtree.playnodes.values())
			// first pass: make a set of the superscopes

			// scope ID -> {node IDs}
			const nodesByScope = new Map<number, Set<string>>()
			playnodesArray.forEach((node : Playnode) => {
				node.playscopes.forEach(scopeID => {
					if (!nodesByScope.has(scopeID)) {
						nodesByScope.set(scopeID, new Set<string>())
					}
					nodesByScope.get(scopeID)?.add(node.id)
				})
			})

			// scope ID -> {scope ID}
			const superscopes = new Map<number, Set<number>>()
			nodesByScope.forEach((nodeIDs1, scopeID1) => {
				// default scope ID is -1 -> superscope of every other scope
				// a scope is its own superscope
				superscopes.set(scopeID1, new Set<number>([-1, scopeID1]))
				nodesByScope.forEach((nodeIDs2, scopeID2) => {
					if (scopeID1 === scopeID2) {
						return
					}
					if (isSupersetOf(nodeIDs2, nodeIDs1)) {
						superscopes.get(scopeID1)?.add(scopeID2)
					}
				})
			})

			// node ID -> scope ID
			const leastScopeByNode = new Map<string, number>()
			playnodesArray.map(playnode => {
				let leastScope : number = -1 // default scope
				playnode.playscopes.forEach(scopeID => {
					// S1 < S2 is subset relation
					// this is asking if scopeID < leastScope
					if (superscopes.get(scopeID)?.has(leastScope)) {
						leastScope = scopeID
					}
				})
				leastScopeByNode.set(playnode.id, leastScope)
			})

			// source ID -> target ID -> scope ID
			const leastScopeByEdge = new Map<string, Map<string, number>>()
			playnodesArray.map(sourceNode => {
				if (sourceNode.next) {
					sourceNode.next.forEach(edge => {
						const targetNode = action.playtree.playnodes.get(edge.targetID) as Playnode;
						let leastScope : number = -1; // default scope
						// an edge's scope is the intersection of the source scopes and target scopes
						(intersection([sourceNode.playscopes, targetNode.playscopes]) as number[]).forEach((scopeID : number) => {
							if (superscopes.get(scopeID)?.has(leastScope)) {
								leastScope = scopeID
							}
						})
						if (!leastScopeByEdge.has(sourceNode.id)) {
							leastScopeByEdge.set(sourceNode.id, new Map<string, number>())
						}
						leastScopeByEdge.get(sourceNode.id)?.set(targetNode.id, leastScope)
					})
				}
			})

			// second pass: set playcounters according to least-scope
			const initialPlaycounters = makeNewPlaycounters()
			
			playnodesArray.forEach((node: Playnode) => {
				const leastScope : number = leastScopeByNode.get(node.id) as number
				if (node.limit >= 0) {
					if (!initialPlaycounters.playnodes.has(leastScope)) {
						initialPlaycounters.playnodes.set(leastScope, new Map<string, number>())
					}
					initialPlaycounters.playnodes.get(leastScope)?.set(node.id, 0)
				}
				const limitedPlayitems = node.playitems.filter(playitem => playitem.limit >= 0)
				if (limitedPlayitems.length > 0) {
					if (!initialPlaycounters.playitems.has(leastScope)) {
						initialPlaycounters.playitems.set(leastScope, new Map<string, Map<string, number>>())
					}
					initialPlaycounters.playitems.get(leastScope)?.set(node.id, new Map<string, number>())
					limitedPlayitems.forEach(content => {
						initialPlaycounters.playitems.get(leastScope)?.get(node.id)?.set(content.id, 0)
					})
				}
				if (node.next) {
					node.next.forEach((edge: Playedge) => {
						const leastScope : number = leastScopeByEdge.get(node.id)?.get(edge.targetID) as number
						if (edge.limit >= 0) {
							if (!initialPlaycounters.playedges.has(leastScope)) {
								initialPlaycounters.playedges.set(leastScope, new Map<string, Map<string, number>>())
							}
							if (!initialPlaycounters.playedges.get(leastScope)?.has(node.id)) {
								initialPlaycounters.playedges.get(leastScope)?.set(node.id, new Map<string, number>())	
							}
							initialPlaycounters.playedges.get(leastScope)?.get(node.id)?.set(edge.targetID, 0)
						}
					})
				}
			})

			// third pass: construct playheads
			let shouldHideFirstNode : boolean = false
			let shouldHideFirstSong : boolean = false
			const newPlayheads: Playhead[] = []
			action.playtree.playroots.forEach((playroot: Playroot, nodeID: string) => {
				const playnode = action.playtree.playnodes.get(nodeID)
				if (playnode !== undefined) {
					let initialNodeIndex = 0
					if (playnode.type === "sequencer") {
						playnode.playitems.every(playitem => {
							if (playitem.multiplier === 0 || playitem.limit === 0) {
								initialNodeIndex++;
								return true
							}
							return false
						})
					} else { // selector
						const elligibleSongs = playnode.playitems.filter(playitem => playitem.limit !== 0).map(content => content.multiplier)
						if (elligibleSongs.length > 1) {
							shouldHideFirstSong = true
						}
						const totalShares = elligibleSongs.reduce((a, b) => a + b, 0)
						const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
						let bound = 0
						playnode.playitems.some((playitem, index) => {
							if (playitem.limit === 0) {
								return false
							}
							bound += playitem.multiplier
							if (randomDrawFromShares < bound) {
								initialNodeIndex = index
								return true
							}
							return false
						})
					}

					newPlayheads[playroot.index] = {
						name: playroot.name,
						node: playnode,
						nodeIndex: initialNodeIndex,
						multIndex: 0,
						shouldHideNode: shouldHideFirstNode,
						shouldHideSong: shouldHideFirstSong,
						history: [],
						playcounters: initialPlaycounters,
						stopped: false,
						spotifyPlaybackPosition_ms: 0,
					}
				}
			})

			return {
				...state,
				playheadIndex: 0,
				playheads: newPlayheads,
				leastScopeByNode: leastScopeByNode,
				leastScopeByEdge: leastScopeByEdge,
				messageLog: [`Playtree "${action.playtree.summary.name}" loaded.`],
				playing: false
			}
		}
		case 'played': {
			const newPlayheads = [...state.playheads]
			const currentPlayhead = newPlayheads[state.playheadIndex]
			if (currentPlayhead) {
				currentPlayhead.stopped = false
			}
			return {
				...state,
				playing: true,
				playheads: newPlayheads
			};
		}
		case 'paused': {
			return {
				...state,
				playing: false,
				messageLog: [...state.messageLog, "Pausing audio."]
			}
		}
		case 'song_ended':
		case 'skipped_forward': {
			if (state.playheads.length == 0) {
				return structuredClone(state)
			}

			const newMessageLog = [...state.messageLog]
			
			const newPlayheads = structuredClone(state.playheads)
			newPlayheads[state.playheadIndex].spotifyPlaybackPosition_ms = 0
			const curPlayhead = state.playheads[state.playheadIndex]
			const curNode = curPlayhead.node
			const curNodeIndex = curPlayhead.nodeIndex
			const curMultIndex = curPlayhead.multIndex
			const curLeastScope : number = state.leastScopeByNode.get(curNode.id) as number
			let nextNodeIndex = curNodeIndex
			let nextMultIndex = curMultIndex

			let newPlaycounters = structuredClone(curPlayhead.playcounters)
			
			if (curNode.playitems[nextNodeIndex]) {
				const songName = curNode.playitems[nextNodeIndex].name
				newMessageLog.push(action.type === 'skipped_forward' ? `Skipping forward...` : `${songName} ended...`)
				if (newPlaycounters.playitems.get(curLeastScope)?.has(curNode.id)) {
					const contentMap = newPlaycounters.playitems.get(curLeastScope)?.get(curNode.id) as Map<string, number>
					const playitemID = curNode.playitems[nextNodeIndex].id
					if (contentMap.has(playitemID)) {
						const count = contentMap.get(playitemID) as number
						newPlaycounters.playitems.get(curLeastScope)?.get(curNode.id)?.set(playitemID, count + 1)
					}
				}
			}

			// I'm in a sequence node
			if (curNode.type === "sequencer") {
				// If we've hit mult or repeat limit, then we skip forward.
				// case 1/2: either repeat limit is reached, or mult limit is reached.
				//   - in either case, we skip forward to the next content available.
				let movedOnce = false
				nextMultIndex++
				while (nextNodeIndex < curNode.playitems.length) {
					const curPlayitem = curNode.playitems[nextNodeIndex]
					const contentPlays: number = newPlaycounters.playitems.get(curLeastScope)?.get(curNode.id)?.get(curPlayitem.id) ?? -1

					if ((contentPlays >= 0 && contentPlays >= curPlayitem.limit) || nextMultIndex >= curPlayitem.multiplier) {
						nextNodeIndex++
						nextMultIndex = 0
						movedOnce = true
					} else {
						break
					}
				}

				if (nextNodeIndex < curNode.playitems.length) {
					if (!movedOnce && nextMultIndex < curNode.playitems[nextNodeIndex].multiplier) {
						movedOnce = true
					}

					if (movedOnce) {
						newPlayheads[state.playheadIndex].history.push({
							playnodeID: curNode.id,
							index: curNodeIndex,
							multIndex: curMultIndex,
							traversedPlayedge: null,
							cachedPlaycounters: null
						})
						newPlayheads[state.playheadIndex].node = curNode
						newPlayheads[state.playheadIndex].multIndex = nextMultIndex
						newPlayheads[state.playheadIndex].nodeIndex = nextNodeIndex
						newPlayheads[state.playheadIndex].playcounters = newPlaycounters

						return {
							...state,
							playheads: newPlayheads,
							messageLog: newMessageLog
						}
					}
				}
			}

			const resetPlayheadAndIncrementIndex = (): number => {
				// reset playhead
				const playheadStartNodeID = newPlayheads[state.playheadIndex].history[0]?.playnodeID ?? newPlayheads[state.playheadIndex].node.id
				const playheadStartNode = action.playtree.playnodes.get(playheadStartNodeID)
				if (playheadStartNode) {
					let initialNodeIndex = 0
					if (playheadStartNode.type === "sequencer") {
						playheadStartNode.playitems.forEach(playitem => {
							if (playitem.multiplier === 0 || playitem.limit === 0) {
								initialNodeIndex++;
							}
						})
					} else { // selector
						const totalShares = playheadStartNode.playitems.filter(playitem => playitem.limit !== 0).map(playitem => playitem.multiplier).reduce((a, b) => a + b, 0)
						const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
						let bound = 0
						playheadStartNode.playitems.some((playitem, index) => {
							if (playitem.limit === 0) {
								return false
							}
							bound += playitem.multiplier
							if (randomDrawFromShares < bound) {
								initialNodeIndex = index
								return true
							}
							return false
						})
					}
					const oldPlaycounters = newPlayheads[state.playheadIndex].playcounters
					const zeroedPlaycounters = zeroPlaycounters(oldPlaycounters)
					newPlayheads[state.playheadIndex] = {
						...newPlayheads[state.playheadIndex],
						node: playheadStartNode,
						nodeIndex: initialNodeIndex,
						multIndex: 0,
						history: [],
						playcounters: zeroedPlaycounters,
						stopped: true,
						spotifyPlaybackPosition_ms: 0
					}
				}
				// move to next playhead
				return (state.playheadIndex + 1) % newPlayheads.length
			}

			const curNodePlaycount = newPlaycounters.playnodes.get(curLeastScope)?.get(curNode.id)
			if (curNodePlaycount !== undefined) {
				newPlaycounters.playnodes.get(curLeastScope)?.set(curNode.id, Math.min(curNodePlaycount + 1, curNode.limit))
			}

			const cachedPlaycounters = makeNewPlaycounters()
			const LOOP_LIMIT = 10_000 // prevent infinite no-song loops
			let curNodeForEdgeTraversal = curNode
			let exitingScopes : number[] = []
			let loopCounter = 0;
			while (true) {
				loopCounter++;
				if (loopCounter === LOOP_LIMIT) {
					newMessageLog.push("Too many playnodes have been passed through with no song to play. Resetting playhead.")
					break;
				}
				if (!curNodeForEdgeTraversal.next) {
					newMessageLog.push(`Playnode ${curNodeForEdgeTraversal.name} has no outgoing edges. Resetting playhead.`)
					break;
				}

				// go through each edge and choose edges by
				// the lowest available priority group
				let totalShares = 0
				const elligibleEdges: Playedge[] = []
				const nextEdgesSortedByPriority = [...curNodeForEdgeTraversal.next].sort((playedge1, playedge2) => playedge1.priority - playedge2.priority)
				let currentPriority = 0
				for (let i in nextEdgesSortedByPriority) {
					let curEdge = nextEdgesSortedByPriority[i]

					if (curEdge.priority > currentPriority && elligibleEdges.length > 0) {
						break
					}

					let curLeastScopeForEdge : number = state.leastScopeByEdge.get(curNode.id)?.get(curEdge.targetID) as number

					const counter = newPlaycounters.playedges.get(curLeastScopeForEdge)?.get(curNodeForEdgeTraversal.id)?.get(curEdge.targetID)
					if (counter !== undefined && curEdge.limit >= 0 && counter >= curEdge.limit) {
						continue
					}

					if (!curEdge.shares) {
						totalShares += 1
					} else {
						totalShares += curEdge.shares
					}
					elligibleEdges.push(curEdge)
				}
				if (elligibleEdges.length === 0) {
					newMessageLog.push(`Playnode ${curNodeForEdgeTraversal.name} has no available outgoing edges. Resetting playhead.`)
					break;
				}
				const scaledRand = Math.floor(action.edgeRand * totalShares)
				let bound: number = 0
				let selectedEdge: Playedge = elligibleEdges[0]
				for (let i in elligibleEdges) {
					const curEdge = elligibleEdges[i]
					const curShares = curEdge.shares ? curEdge.shares : 1
					bound += curShares
					if (scaledRand < bound) {
						selectedEdge = curEdge
						break
					}
				}
				const curLeastScopeForSelectedEdge : number = state.leastScopeByEdge.get(curNodeForEdgeTraversal.id)?.get(selectedEdge.targetID) as number
				const edgePlaycount = newPlaycounters.playedges.get(curLeastScopeForSelectedEdge)?.get(curNodeForEdgeTraversal.id)?.get(selectedEdge.targetID)
				if (edgePlaycount !== undefined) {
					newPlaycounters.playedges.get(curLeastScopeForSelectedEdge)?.get(curNodeForEdgeTraversal.id)?.set(selectedEdge.targetID, edgePlaycount + 1)
				}

				
				let nextNode = action.playtree.playnodes.get(selectedEdge.targetID)
				if (nextNode) {
					newMessageLog.push(`Traversing playedge '${curNodeForEdgeTraversal.name} => ${nextNode.name}'${edgePlaycount !== undefined ? ` (${edgePlaycount + 1} / ${selectedEdge.limit})` : ""}`)
					exitingScopes = union([exitingScopes, diff([curNode.playscopes, nextNode.playscopes]) as number[]]) as number[]
					exitingScopes.forEach(scopeID => {
						cachedPlaycounters.playitems.set(scopeID, newPlaycounters.playitems.get(scopeID) as Map<string, Map<string, number>>)
						cachedPlaycounters.playnodes.set(scopeID, newPlaycounters.playnodes.get(scopeID) as Map<string, number>)
						cachedPlaycounters.playedges.set(scopeID, newPlaycounters.playedges.get(scopeID) as Map<string, Map<string, number>>)
						newPlaycounters = zeroPlaycountersAtScope(newPlaycounters, scopeID)
					})

					const nextNodeLeastScope = state.leastScopeByNode.get(nextNode.id) as number
					const nextNodePlaycount = newPlaycounters.playnodes.get(nextNodeLeastScope)?.get(nextNode.id)
					if (nextNodePlaycount !== undefined && nextNodePlaycount >= nextNode.limit) {
						newMessageLog.push(`Passing through playnode '${nextNode.name}' whose play count has been exceeded...`)
						curNodeForEdgeTraversal = nextNode
						continue
					}
					if (nextNode.type === "selector") {
						let selectedNodeIndex = -1

						const totalShares = nextNode.playitems.filter(playitem => {
							const count = newPlaycounters.playitems.get(nextNodeLeastScope)?.get(nextNode.id)?.get(playitem.id)
							return count === undefined || count < playitem.limit
						}).map(playitem => playitem.multiplier).reduce((a, b) => a + b, 0)
						const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
						let bound = 0
						if (!nextNode.playitems.some((playitem, index) => {
							const count = newPlaycounters.playitems.get(nextNodeLeastScope)?.get(nextNode.id)?.get(playitem.id)
							if (count !== undefined && count >= playitem.limit) {
								return false
							}
							bound += playitem.multiplier
							if (randomDrawFromShares < bound) {
								selectedNodeIndex = index
								return true
							}
							return false
						})) {
							if (nextNode.playitems.length === 0) {
								newMessageLog.push(`Passing through playnode '${nextNode.name}' with no songs...`)
							} else {
								newMessageLog.push(`Passing through playnode '${nextNode.name}' whose songs have all exceeded play count...`)
							}
							curNodeForEdgeTraversal = nextNode
							continue
						}
						newPlayheads[state.playheadIndex].nodeIndex = selectedNodeIndex
					} else { // sequencer
						let initialNodeIndex = 0
						if (nextNode.playitems.every(playitem => {
							const count = newPlaycounters.playitems.get(nextNodeLeastScope)?.get(nextNode.id)?.get(playitem.id)
							if (playitem.multiplier === 0 || (count !== undefined && count >= playitem.limit)) {
								initialNodeIndex++;
								return true
							}
							return false
						})) {
							if (nextNode.playitems.length === 0) {
								newMessageLog.push(`Passing through playnode '${nextNode.name}' with no songs...`)
							} else {
								newMessageLog.push(`Passing through playnode '${nextNode.name}' whose songs have all exceeded play count...`)
							}
							curNodeForEdgeTraversal = nextNode
							continue
						}

						newPlayheads[state.playheadIndex].nodeIndex = initialNodeIndex
					}

					// zero all exiting scopes
					newPlayheads[state.playheadIndex].history.push({
						playnodeID: curNode.id,
						index: curNodeIndex,
						multIndex: curMultIndex,
						traversedPlayedge: selectedEdge,
						cachedPlaycounters: cachedPlaycounters
					})
					newPlayheads[state.playheadIndex].node = nextNode
					newPlayheads[state.playheadIndex].multIndex = 0
				}
				newPlayheads[state.playheadIndex].playcounters = newPlaycounters
				return {
					...state,
					playheads: newPlayheads,
					messageLog: newMessageLog
				}
			}
			const nextPlayheadIndex = resetPlayheadAndIncrementIndex()
			const playheadShouldPlay = !newPlayheads[nextPlayheadIndex].stopped
			return {
				...state,
				playheadIndex: nextPlayheadIndex,
				playheads: newPlayheads,
				playing: playheadShouldPlay,
				autoplay: playheadShouldPlay,
				messageLog: newMessageLog
			}
		}
		case 'skipped_backward': {
			const newPlayheads = structuredClone(state.playheads)
			newPlayheads[state.playheadIndex].spotifyPlaybackPosition_ms = 0
			const prevHistoryNode = newPlayheads[state.playheadIndex].history.pop()
			if (prevHistoryNode === undefined) {
				return structuredClone(state)
			} else {
				const prevPlaynode = action.playtree.playnodes.get(prevHistoryNode.playnodeID)
				if (prevPlaynode === undefined) {
					return structuredClone(state)
				}
				newPlayheads[state.playheadIndex].node = structuredClone(prevPlaynode)
				newPlayheads[state.playheadIndex].nodeIndex = prevHistoryNode.index

				const newPlaycounters = structuredClone(newPlayheads[state.playheadIndex].playcounters)

				// restore cleared playcounters
				if (prevHistoryNode.cachedPlaycounters !== null) {
					prevHistoryNode.cachedPlaycounters.playitems.forEach((counter, scopeID) => {
						newPlaycounters.playitems.set(scopeID, counter)
					})
					prevHistoryNode.cachedPlaycounters.playnodes.forEach((counter, scopeID) => {
						newPlaycounters.playnodes.set(scopeID, counter)
					})
					prevHistoryNode.cachedPlaycounters.playedges.forEach((counter, scopeID) => {
						newPlaycounters.playedges.set(scopeID, counter)
					})
				}

				const prevLeastScope = state.leastScopeByNode.get(prevPlaynode.id) as number

				const prevPlayitem = prevPlaynode.playitems[prevHistoryNode.index]
				let oldContentRepeatCounterValue: number | undefined = undefined
				if (prevPlayitem) {
					oldContentRepeatCounterValue = newPlaycounters.playitems.get(prevLeastScope)?.get(prevPlaynode.id)?.get(prevPlayitem.id)
				}
				if (oldContentRepeatCounterValue !== undefined) {
					newPlaycounters.playitems.get(prevLeastScope)?.get(prevPlaynode.id)?.set(prevPlayitem.id, oldContentRepeatCounterValue - 1)
				}

				const traversedPlayedge = prevHistoryNode.traversedPlayedge
				if (traversedPlayedge && traversedPlayedge.limit >= 0) {
					const oldNodeRepeatCounterValue = newPlaycounters.playnodes.get(prevLeastScope)?.get(prevPlaynode.id)
					if (oldNodeRepeatCounterValue !== undefined) {
						newPlaycounters.playnodes.get(prevLeastScope)?.set(prevPlaynode.id, Math.max(oldNodeRepeatCounterValue - 1, 0))
					}
					const prevLeastScopeForEdge = state.leastScopeByEdge.get(prevPlaynode.id)?.get(traversedPlayedge.targetID) as number
					const oldEdgeRepeatCounterValue = newPlaycounters.playedges.get(prevLeastScopeForEdge)?.get(prevPlaynode.id)?.get(traversedPlayedge.targetID)
					if (oldEdgeRepeatCounterValue !== undefined) {
						newPlaycounters.playedges.get(prevLeastScopeForEdge)?.get(prevPlaynode.id)?.set(traversedPlayedge.targetID, Math.max(oldEdgeRepeatCounterValue - 1, 0))
					}
				}
				newPlayheads[state.playheadIndex].playcounters = newPlaycounters
				return {
					...state,
					playheads: newPlayheads
				}
			}
		}
		case 'decremented_playhead': {
			const newPlayheadIndex = (state.playheadIndex + state.playheads.length - 1) % state.playheads.length
			return {
				...state,
				playheadIndex: newPlayheadIndex,
				messageLog: [...state.messageLog, `Moving to playhead ${state.playheads[newPlayheadIndex].name}.`]
			}
		}
		case 'incremented_playhead': {
			const newPlayheadIndex = (state.playheadIndex + 1) % state.playheads.length
			return {
				...state,
				playheadIndex: newPlayheadIndex,
				messageLog: [...state.messageLog, `Moving to playhead ${state.playheads[newPlayheadIndex].name}.`]
			}
		}
		case 'autoplay_set': {
			return {
				...state,
				autoplay: action.autoplay
			}
		}
		case 'song_progress_received': {
			const newPlayheads = structuredClone(state.playheads)
			newPlayheads[state.playheadIndex].spotifyPlaybackPosition_ms = action.spotifyPlaybackPosition_ms
			return {
				...state,
				playheads: newPlayheads
			}
		}
		case 'spotify_player_ready': {
			return {
				...state,
				spotifyPlayerReady: true
			}
		}
		case 'message_logged': {
			return {
				...state,
				messageLog: [...state.messageLog, action.message]
			}
		}
	}
}

export default reducer