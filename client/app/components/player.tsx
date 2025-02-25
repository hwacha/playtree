import { useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import { Content, HistoryNode, makeDefaultPlayscope, PlayEdge, PlayheadInfo, PlayNode, Playscope, Playtree } from "../types";
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk";
import deepEqual from "deep-equal";
import { diff, intersection, isSupersetOf } from '@opentf/std';

type PlayerProps = {
	playtree: Playtree | null
	autoplay: boolean | undefined
}

export type Playcounters = {
	// scope ID -> node ID -> content ID -> playcount
	content: Map<number, Map<string, Map<string, number>>>;
	// scope ID -> node ID -> playcount
	node: Map<number, Map<string, number>>;
	// scope ID -> source node ID -> target node ID -> playcount
	edge: Map<number, Map<string, Map<string, number>>>;
}

const makeNewPlaycounters = () : Playcounters => {
	return {
		content: new Map<number, Map<string, Map<string, number>>>(),
		node: new Map<number, Map<string, number>>(),
		edge: new Map<number, Map<string, Map<string, number>>>()
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
	if (newPlaycounters.content.has(scopeID)) {
		const newContentPlaycounter = new Map<string, Map<string, number>>()
		const contentKeysIter : MapIterator<string> = playcounters.content.get(scopeID)?.keys() as MapIterator<string>
		for (let key = contentKeysIter.next(); !key.done; key = contentKeysIter.next()) {
			newContentPlaycounter.set(key.value, zeroCounter(playcounters.content.get(scopeID)?.get(key.value) as Map<string, number>))
		}
		newPlaycounters.content.set(scopeID, newContentPlaycounter)
	}

	if (newPlaycounters.node.has(scopeID)) {
		const newNodePlaycounter = zeroCounter(newPlaycounters.node.get(scopeID) as Map<string, number>)
		newPlaycounters.node.set(scopeID, newNodePlaycounter)
	}

	if (newPlaycounters.edge.has(scopeID)) {
		const newEdgeCounter = new Map<string, Map<string, number>>()
		const edgeKeysIter : MapIterator<string> = playcounters.edge.get(scopeID)?.keys() as MapIterator<string>
		for (let key = edgeKeysIter.next(); !key.done; key = edgeKeysIter.next()) {
			newEdgeCounter.set(key.value, zeroCounter(playcounters.edge.get(scopeID)?.get(key.value) as Map<string, number>))
		}
	}

	return newPlaycounters
}

const zeroPlaycounters = (playcounters: Playcounters): Playcounters => {
	const relevantScopes : number[] = intersection([
		Array.from(playcounters.content.keys()),
		Array.from(playcounters.node.keys()),
		Array.from(playcounters.edge.keys())]) as number[]

	let newPlaycounters = playcounters
	relevantScopes.forEach(scopeID => {
		newPlaycounters = zeroPlaycountersAtScope(newPlaycounters, scopeID)
	})

	return newPlaycounters
}

type Playhead = {
	name: string;
	node: PlayNode;
	nodeIndex: number;
	multIndex: number;
	history: HistoryNode[];
	
	playcounters: Playcounters;

	stopped: boolean;
	spotifyPlaybackPosition_ms: number;
}

type PlayerState = {
	playheads: Playhead[];
	playheadIndex: number;

	leastScopeByNode: Map<string, number>;
	leastScopeByEdge: Map<string, Map<string, number>>;

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
}

const reducer = (state: PlayerState, action: PlayerAction): PlayerState => {
	switch (action.type) {
		case 'playtree_loaded': {
			const playnodesArray = Array.from(action.playtree.nodes.values())
			// first pass: make a set of the superscopes

			// scope ID -> {node IDs}
			const nodesByScope = new Map<number, Set<string>>()
			playnodesArray.forEach((node : PlayNode) => {
				node.scopes.forEach(scopeID => {
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
				playnode.scopes.forEach(scopeID => {
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
				sourceNode.next.forEach(edge => {
					const targetNode = action.playtree.nodes.get(edge.nodeID) as PlayNode;
					let leastScope : number = -1; // default scope
					// an edge's scope is the intersection of the source scopes and target scopes
					(intersection([sourceNode.scopes, targetNode.scopes]) as number[]).forEach((scopeID : number) => {
						if (superscopes.get(scopeID)?.has(leastScope)) {
							leastScope = scopeID
						}
					})
					if (!leastScopeByEdge.has(sourceNode.id)) {
						leastScopeByEdge.set(sourceNode.id, new Map<string, number>())
					}
					leastScopeByEdge.get(sourceNode.id)?.set(targetNode.id, leastScope)
				})
			})

			// second pass: set playcounters according to least-scope
			const initialPlaycounters = makeNewPlaycounters()
			
			playnodesArray.forEach((node: PlayNode) => {
				const leastScope : number = leastScopeByNode.get(node.id) as number
				if (node.repeat >= 0) {
					if (!initialPlaycounters.node.has(leastScope)) {
						initialPlaycounters.node.set(leastScope, new Map<string, number>())
					}
					initialPlaycounters.node.get(leastScope)?.set(node.id, 0)
				}
				const limitedContentList = node.content.filter(content => content.repeat >= 0)
				if (limitedContentList.length > 0) {
					if (!initialPlaycounters.content.has(leastScope)) {
						initialPlaycounters.content.set(leastScope, new Map<string, Map<string, number>>())
					}
					initialPlaycounters.content.get(leastScope)?.set(node.id, new Map<string, number>())
					limitedContentList.forEach(content => {
						initialPlaycounters.content.get(leastScope)?.get(node.id)?.set(content.id, 0)
					})
				}
				if (node.next) {
					node.next.forEach((edge: PlayEdge) => {
						const leastScope : number = leastScopeByEdge.get(node.id)?.get(edge.nodeID) as number
						if (edge.repeat >= 0) {
							if (!initialPlaycounters.edge.has(leastScope)) {
								initialPlaycounters.edge.set(leastScope, new Map<string, Map<string, number>>())
							}
							if (!initialPlaycounters.edge.get(leastScope)?.has(node.id)) {
								initialPlaycounters.edge.get(leastScope)?.set(node.id, new Map<string, number>())	
							}
							initialPlaycounters.edge.get(leastScope)?.get(node.id)?.set(edge.nodeID, 0)
						}
					})
				}
			})

			// third pass: construct playheads
			const newPlayheads: Playhead[] = []
			action.playtree.playroots.forEach((playroot: PlayheadInfo, nodeID: string) => {
				const playnode = action.playtree.nodes.get(nodeID)
				if (playnode !== undefined) {
					let initialNodeIndex = 0
					if (playnode.type === "sequence") {
						playnode.content.every(content => {
							if (content.mult === 0 || content.repeat === 0) {
								initialNodeIndex++;
								return true
							}
							return false
						})
					} else { // selector
						const totalShares = playnode.content.filter(content => content.repeat !== 0).map(content => content.mult).reduce((a, b) => a + b, 0)
						const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
						let bound = 0
						playnode.content.some((content, index) => {
							if (content.repeat === 0) {
								return false
							}
							bound += content.mult
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
						history: [],
						playcounters: initialPlaycounters,
						stopped: false,
						spotifyPlaybackPosition_ms: 0
					}
				}
			})

			return {
				...state,
				playheadIndex: 0,
				playheads: newPlayheads,
				leastScopeByNode: leastScopeByNode,
				leastScopeByEdge: leastScopeByEdge,
				playing: false
			}
		}
		case 'played': {
			return {
				...state,
				playing: true
			};
		}
		case 'paused': {
			return {
				...state,
				playing: false
			}
		}
		case 'song_ended':
		case 'skipped_forward': {
			if (state.playheads.length == 0) {
				return structuredClone(state)
			}
			
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
			
			if (curNode.content[nextNodeIndex] && newPlaycounters.content.get(curLeastScope)?.has(curNode.id)) {
				const contentMap = newPlaycounters.content.get(curLeastScope)?.get(curNode.id) as Map<string, number>
				const contentID = curNode.content[nextNodeIndex].id
				if (contentMap.has(contentID)) {
					const count = contentMap.get(contentID) as number
					newPlaycounters.content.get(curLeastScope)?.get(curNode.id)?.set(contentID, count + 1)
				}
			}

			// I'm in a sequence node
			if (curNode.type === "sequence") {
				// If we've hit mult or repeat limit, then we skip forward.
				// case 1/2: either repeat limit is reached, or mult limit is reached.
				//   - in either case, we skip forward to the next content available.
				let movedOnce = false
				nextMultIndex++
				while (nextNodeIndex < curNode.content.length) {
					const curContent = curNode.content[nextNodeIndex]
					const contentPlays: number = newPlaycounters.content.get(curLeastScope)?.get(curNode.id)?.get(curContent.id) ?? -1

					if ((contentPlays >= 0 && contentPlays >= curContent.repeat) || nextMultIndex >= curContent.mult) {
						nextNodeIndex++
						nextMultIndex = 0
						movedOnce = true
					} else {
						break
					}
				}

				if (nextNodeIndex < curNode.content.length) {
					if (!movedOnce && nextMultIndex < curNode.content[nextNodeIndex].mult) {
						movedOnce = true
					}

					if (movedOnce) {
						newPlayheads[state.playheadIndex].history.push({
							nodeID: curNode.id,
							index: curNodeIndex,
							multIndex: curMultIndex,
							traversedPlayedge: null,
							clearedPlaycounters: null
						})
						newPlayheads[state.playheadIndex].node = curNode
						newPlayheads[state.playheadIndex].multIndex = nextMultIndex
						newPlayheads[state.playheadIndex].nodeIndex = nextNodeIndex
						newPlayheads[state.playheadIndex].playcounters = newPlaycounters

						return {
							...state,
							playheads: newPlayheads,
						}
					}
				}
			}

			const resetPlayheadAndIncrementIndex = (): number => {
				
				// reset playhead
				const playheadStartNodeID = newPlayheads[state.playheadIndex].history[0]?.nodeID ?? newPlayheads[state.playheadIndex].node.id
				const playheadStartNode = action.playtree.nodes.get(playheadStartNodeID)
				if (playheadStartNode) {
					let initialNodeIndex = 0
					if (playheadStartNode.type === "sequence") {
						playheadStartNode.content.forEach(content => {
							if (content.mult === 0 || content.repeat === 0) {
								initialNodeIndex++;
							}
						})
					} else { // selector
						const totalShares = playheadStartNode.content.filter(content => content.repeat !== 0).map(content => content.mult).reduce((a, b) => a + b, 0)
						const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
						let bound = 0
						playheadStartNode.content.some((content, index) => {
							if (content.repeat === 0) {
								return false
							}
							bound += content.mult
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

			const curNodePlaycount = newPlaycounters.node.get(curLeastScope)?.get(curNode.id)
			if (curNodePlaycount !== undefined) {
				newPlaycounters.node.get(curLeastScope)?.set(curNode.id, Math.min(curNodePlaycount + 1, curNode.repeat))
			}

			const LOOP_LIMIT = 10_000 // prevent infinite no-song loops
			let curNodeForEdgeTraversal = curNode
			for (let loopCounter = 0; loopCounter < LOOP_LIMIT; loopCounter++) {
				if (!curNodeForEdgeTraversal.next) {
					break;
				}

				let totalShares = 0
				const elligibleEdges: PlayEdge[] = []
				const nextEdgesSortedByPriority = [...curNodeForEdgeTraversal.next].sort((playedge1, playedge2) => playedge1.priority - playedge2.priority)
				let currentPriority = 0

				// go through each edge and choose edges by
				// the lowest available priority group
				for (let i in nextEdgesSortedByPriority) {
					let curEdge = nextEdgesSortedByPriority[i]

					if (curEdge.priority > currentPriority && elligibleEdges.length > 0) {
						break
					}

					let curLeastScopeForEdge : number = state.leastScopeByEdge.get(curNode.id)?.get(curEdge.nodeID) as number

					const counter = newPlaycounters.edge.get(curLeastScopeForEdge)?.get(curNodeForEdgeTraversal.id)?.get(curEdge.nodeID)
					if (counter !== undefined && curEdge.repeat >= 0 && counter >= curEdge.repeat) {
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
					break;
				}
				const scaledRand = Math.floor(action.edgeRand * totalShares)
				let bound: number = 0
				let selectedEdge: PlayEdge = elligibleEdges[0]
				for (let i in elligibleEdges) {
					const curEdge = elligibleEdges[i]
					const curShares = curEdge.shares ? curEdge.shares : 1
					bound += curShares
					if (scaledRand < bound) {
						selectedEdge = curEdge
						break
					}
				}
				const curLeastScopeForSelectedEdge : number = state.leastScopeByEdge.get(curNodeForEdgeTraversal.id)?.get(selectedEdge.nodeID) as number
				const edgePlaycount = newPlaycounters.edge.get(curLeastScopeForSelectedEdge)?.get(curNodeForEdgeTraversal.id)?.get(selectedEdge.nodeID)
				if (edgePlaycount !== undefined) {
					newPlaycounters.edge.get(curLeastScopeForSelectedEdge)?.get(curNodeForEdgeTraversal.id)?.set(selectedEdge.nodeID, edgePlaycount + 1)
				}
				let nextNode = action.playtree.nodes.get(selectedEdge.nodeID)
				if (nextNode) {
					const nextNodeLeastScope = state.leastScopeByNode.get(nextNode.id) as number
					const nextNodePlaycount = newPlaycounters.node.get(nextNodeLeastScope)?.get(nextNode.id)
					if (nextNodePlaycount !== undefined && nextNodePlaycount >= nextNode.repeat) {
						curNodeForEdgeTraversal = nextNode
						continue
					}
					if (nextNode.type === "selector") {
						let selectedNodeIndex = -1

						const totalShares = nextNode.content.filter(content => {
							const count = newPlaycounters.content.get(nextNodeLeastScope)?.get(nextNode.id)?.get(content.id)
							return count === undefined || count < content.repeat
						}).map(content => content.mult).reduce((a, b) => a + b, 0)
						const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
						let bound = 0
						if (!nextNode.content.some((content, index) => {
							const count = newPlaycounters.content.get(nextNodeLeastScope)?.get(nextNode.id)?.get(content.id)
							if (count !== undefined && count >= content.repeat) {
								return false
							}
							bound += content.mult
							if (randomDrawFromShares < bound) {
								selectedNodeIndex = index
								return true
							}
							return false
						})) {
							curNodeForEdgeTraversal = nextNode
							continue
						}
						newPlayheads[state.playheadIndex].nodeIndex = selectedNodeIndex
					} else { // sequencer
						let initialNodeIndex = 0
						if (nextNode.content.every(content => {
							const count = newPlaycounters.content.get(nextNodeLeastScope)?.get(nextNode.id)?.get(content.id)
							if (content.mult === 0 || (count !== undefined && count >= content.repeat)) {
								initialNodeIndex++;
								return true
							}
							return false
						})) {
							curNodeForEdgeTraversal = nextNode
							continue
						}

						newPlayheads[state.playheadIndex].nodeIndex = initialNodeIndex
					}

					// zero all exiting scopes
					const exitingScopes = diff([curNode.scopes, nextNode.scopes]) as number[]
					const clearedPlaycounters = makeNewPlaycounters()
					exitingScopes.forEach(scopeID => {
						clearedPlaycounters.content.set(scopeID, newPlaycounters.content.get(scopeID) as Map<string, Map<string, number>>)
						clearedPlaycounters.node.set(scopeID, newPlaycounters.node.get(scopeID) as Map<string, number>)
						clearedPlaycounters.edge.set(scopeID, newPlaycounters.edge.get(scopeID) as Map<string, Map<string, number>>)
						newPlaycounters = zeroPlaycountersAtScope(newPlaycounters, scopeID)
					})
					newPlayheads[state.playheadIndex].history.push({
						nodeID: curNode.id,
						index: curNodeIndex,
						multIndex: curMultIndex,
						traversedPlayedge: selectedEdge,
						clearedPlaycounters: clearedPlaycounters
					})
					newPlayheads[state.playheadIndex].node = nextNode
					newPlayheads[state.playheadIndex].multIndex = 0
				}
				newPlayheads[state.playheadIndex].playcounters = newPlaycounters
				return {
					...state,
					playheads: newPlayheads,
				}
			}
			const nextPlayheadIndex = resetPlayheadAndIncrementIndex()
			const playheadShouldPlay = !newPlayheads[nextPlayheadIndex].stopped
			return {
				...state,
				playheadIndex: nextPlayheadIndex,
				playheads: newPlayheads,
				playing: playheadShouldPlay,
				autoplay: playheadShouldPlay
			}
		}
		case 'skipped_backward': {
			const newPlayheads = structuredClone(state.playheads)
			newPlayheads[state.playheadIndex].spotifyPlaybackPosition_ms = 0
			const prevHistoryNode = newPlayheads[state.playheadIndex].history.pop()
			if (prevHistoryNode === undefined) {
				return structuredClone(state)
			} else {
				const prevPlaynode = action.playtree.nodes.get(prevHistoryNode.nodeID)
				if (prevPlaynode === undefined) {
					return structuredClone(state)
				}
				newPlayheads[state.playheadIndex].node = structuredClone(prevPlaynode)
				newPlayheads[state.playheadIndex].nodeIndex = prevHistoryNode.index

				const newPlaycounters = structuredClone(newPlayheads[state.playheadIndex].playcounters)

				// restore cleared playcounters
				if (prevHistoryNode.clearedPlaycounters !== null) {
					prevHistoryNode.clearedPlaycounters.content.forEach((counter, scopeID) => {
						newPlaycounters.content.set(scopeID, counter)
					})
					prevHistoryNode.clearedPlaycounters.node.forEach((counter, scopeID) => {
						newPlaycounters.node.set(scopeID, counter)
					})
					prevHistoryNode.clearedPlaycounters.edge.forEach((counter, scopeID) => {
						newPlaycounters.edge.set(scopeID, counter)
					})
				}

				const prevLeastScope = state.leastScopeByNode.get(prevPlaynode.id) as number

				const prevContent = prevPlaynode.content[prevHistoryNode.index]
				let oldContentRepeatCounterValue: number | undefined = undefined
				if (prevContent) {
					oldContentRepeatCounterValue = newPlaycounters.content.get(prevLeastScope)?.get(prevPlaynode.id)?.get(prevContent.id)
				}
				if (oldContentRepeatCounterValue !== undefined) {
					newPlaycounters.content.get(prevLeastScope)?.get(prevPlaynode.id)?.set(prevContent.id, oldContentRepeatCounterValue - 1)
				}

				const traversedPlayedge = prevHistoryNode.traversedPlayedge
				if (traversedPlayedge && traversedPlayedge.repeat >= 0) {
					const oldNodeRepeatCounterValue = newPlaycounters.node.get(prevLeastScope)?.get(prevPlaynode.id)
					if (oldNodeRepeatCounterValue !== undefined) {
						newPlaycounters.node.get(prevLeastScope)?.set(prevPlaynode.id, Math.max(oldNodeRepeatCounterValue - 1, 0))
					}
					const prevLeastScopeForEdge = state.leastScopeByEdge.get(prevPlaynode.id)?.get(traversedPlayedge.nodeID) as number
					const oldEdgeRepeatCounterValue = newPlaycounters.edge.get(prevLeastScopeForEdge)?.get(prevPlaynode.id)?.get(traversedPlayedge.nodeID)
					if (oldEdgeRepeatCounterValue !== undefined) {
						newPlaycounters.edge.get(prevLeastScopeForEdge)?.get(prevPlaynode.id)?.set(traversedPlayedge.nodeID, Math.max(oldEdgeRepeatCounterValue - 1, 0))
					}

					if (oldContentRepeatCounterValue !== undefined || oldNodeRepeatCounterValue !== undefined || oldEdgeRepeatCounterValue !== undefined) {
						newPlayheads[state.playheadIndex].playcounters = newPlaycounters
						return {
							...state,
							playheads: newPlayheads
						}
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
			return {
				...state,
				playheadIndex: (state.playheadIndex + state.playheads.length - 1) % state.playheads.length
			}
		}
		case 'incremented_playhead': {
			return {
				...state,
				playheadIndex: (state.playheadIndex + 1) % state.playheads.length
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
	}
}

export default function Player({ playtree, autoplay }: PlayerProps) {
	const initialPlayheadIndex = 0
	let initialPlayheads: Playhead[] = []

	const [state, dispatch] = useReducer<typeof reducer>(reducer, {
		playheads: initialPlayheads,
		playheadIndex: initialPlayheadIndex,
		leastScopeByNode: new Map<string, number>(),
		leastScopeByEdge: new Map<string, Map<string, number>>(),
		playing: false,
		autoplay: autoplay ?? false,
		spotifyPlayerReady: false,
	})

	const spotify = useMemo(() =>
		SpotifyApi.withUserAuthorization(import.meta.env.VITE_SPOTIFY_CLIENT_ID,
			"http://localhost:5173",
			[
				"streaming",
				"user-read-playback-state",
				"user-modify-playback-state",
				"user-read-email",
				"user-read-private"
			]), [])

	const suggestDeviceName = useCallback(() => {
		const userAgent = navigator.userAgent;

		let browserName = "Unknown Browser"

		if (userAgent.includes('Firefox')) browserName = "Firefox";
		if (userAgent.includes('Chrome')) browserName = "Chrome";
		if (userAgent.includes('Safari')) browserName = "Safari";
		if (userAgent.includes('Edge')) browserName = "Edge";

		let platformName = "Unknown Platform"
		if (userAgent.includes('Win')) platformName = "Windows";
		if (userAgent.includes('Mac')) platformName = "macOS";
		if (userAgent.includes('Linux')) platformName = "Linux";
		if (userAgent.includes('Android')) platformName = "Android";
		if (userAgent.includes('iPhone')) platformName = "iOS";

		return browserName + " on " + platformName;
	}, [navigator.userAgent])

	const deviceName = useMemo<string>(suggestDeviceName, [navigator.userAgent])

	const prevPlaybackState = useRef<Spotify.PlaybackState | null>(null)

	useEffect(() => {
		return // DEBUG
		const script = document.createElement("script");
		script.src = "https://sdk.scdn.co/spotify-player.js";
		script.async = true;

		document.body.appendChild(script);

		let newPlayer: Spotify.Player | null = null;

		window.onSpotifyWebPlaybackSDKReady = () => {
			spotify.getAccessToken().then(async token => {
				let accessToken: AccessToken | null = token
				if (!accessToken) {
					const response = await spotify.authenticate()
					accessToken = response.accessToken
				}
				if (accessToken) {
					newPlayer = new window.Spotify.Player({
						name: 'Playtree Web Player: ' + deviceName,
						getOAuthToken: (cb: any) => { cb(accessToken?.access_token); },
						volume: 1
					});

					newPlayer.activateElement()

					newPlayer.addListener('ready', ({ device_id }: any) => {
						spotify.player.getAvailableDevices().then(({ devices }) => {
							const webPlayerDevice = devices.find(device => device.id === device_id)
							if (webPlayerDevice && webPlayerDevice.id && !webPlayerDevice.is_active) {
								spotify.player.transferPlayback([webPlayerDevice.id], false)
								dispatch({ type: 'spotify_player_ready' })
							}
						})
					});

					newPlayer.addListener('player_state_changed', playbackState => {
						if (prevPlaybackState.current && !prevPlaybackState.current.paused && playbackState.paused && playbackState.position === 0) {
							if (playtree) {
								dispatch({ type: "song_ended", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random() })
							}
						}
						prevPlaybackState.current = playbackState
					})

					newPlayer.connect()
				}
			})
		}

		return () => {
			if (newPlayer) {
				newPlayer.disconnect()
			}
		}
	}, [])

	const oldPlaytree = useRef<Playtree | null>(null)
	useEffect(() => {
		if (playtree && !deepEqual(playtree, oldPlaytree.current)) {
			dispatch({ type: "playtree_loaded", playtree: playtree, selectorRand: Math.random(), autoplay: autoplay })
			oldPlaytree.current = playtree
		}
	}, [playtree])

	useEffect(() => {
		const currentPlayhead = state.playheads[state.playheadIndex]
		if (currentPlayhead) {
			spotify.player.getPlaybackState().then(playbackState => {
				if (playbackState) {
					const deviceID = playbackState.device.id
					if (deviceID) {
						if (state.playing) {
							const currentSongURI = currentPlayhead.node.content[currentPlayhead.nodeIndex].uri
							spotify.player.startResumePlayback(deviceID, undefined, [currentSongURI], undefined, currentPlayhead.spotifyPlaybackPosition_ms)
						} else {
							spotify.player.pausePlayback(deviceID)
						}
					}
				}
			})
		}
	}, [state.playheads, state.playheadIndex])

	const handlePlayPauseAudio = useCallback((shouldPlay: boolean) => {
		const currentPlayhead = state.playheads[state.playheadIndex]
		const currentSongURI = currentPlayhead.node.content[currentPlayhead.nodeIndex].uri
		spotify.player.getPlaybackState().then(playbackState => {
			const deviceID = playbackState.device.id
			if (deviceID) {
				if (shouldPlay) {
					spotify.player.startResumePlayback(deviceID, undefined, [currentSongURI], undefined, currentPlayhead.spotifyPlaybackPosition_ms)
				} else {
					spotify.player.pausePlayback(deviceID)
					dispatch({ type: "song_progress_received", spotifyPlaybackPosition_ms: playbackState.progress_ms })
				}
			}
		})
		dispatch({ type: shouldPlay ? "played" : "paused" })
		dispatch({ type: "autoplay_set", autoplay: shouldPlay })
	}, [state.playheads, state.playheadIndex])

	if (playtree === null) {
		return (<div className="bg-green-600 fixed flex w-full h-36 left-48 bottom-0"><div className="text-white mx-auto my-16 w-fit font-lilitaOne">No playtrees.</div></div>)
	} else {
		let currentPlayhead: Playhead | null | undefined = null
		let currentPlaynode: PlayNode | null | undefined = null
		
		let currentContent: Content | null | undefined = null

		let currentNodePlaycount: number | undefined = undefined
		let currentNodeMaxPlays: number | undefined = undefined
		let currentContentPlaycount: number | undefined = undefined
		let currentContentMaxPlays: number | undefined = undefined

		if (state && state.playheads) {
			currentPlayhead = state.playheads[state.playheadIndex]
			if (currentPlayhead && currentPlayhead.node) {
				currentPlaynode = currentPlayhead.node
				const currentScope : number = state.leastScopeByNode.get(currentPlaynode.id) as number
				currentNodePlaycount = currentPlayhead.playcounters.node.get(currentScope)?.get(currentPlaynode.id)
				currentNodeMaxPlays = currentPlaynode.repeat
				if (currentPlaynode.content) {
					currentContent = currentPlaynode.content[currentPlayhead.nodeIndex]
					currentContentPlaycount = currentPlayhead.playcounters.content.get(currentScope)?.get(currentPlaynode.id)?.get(currentContent.id)
					currentContentMaxPlays = currentContent.repeat
				}
			}
		}
		return (
			<div className="bg-green-600 fixed flex w-[calc(100vw-12rem)] h-36 left-48 bottom-0">
				<div className="w-full my-auto">
					<div className="w-fit float-right mr-8">
						<div className="w-fit mx-auto">
							<button
								type="button"
								title="Previous Playhead"
								className="rounded-sm p-2 text-white"
								onClick={() => dispatch({ type: "decremented_playhead", playtree: playtree })}>
								{"\u23EB"}
							</button>
						</div>
						<div className="w-fit mx-auto">
							<button
								type="button"
								title="Skip Backward"
								className="rounded-sm p-2 text-white"
								onClick={() => dispatch({ type: "skipped_backward", playtree: playtree })}>
								{"\u23EE"}
							</button>
							<button
								type="button"
								title={!state.spotifyPlayerReady ? "Loading Player" : state.playing ? "Pause" : "Play"}
								className="rounded-sm p-2 text-white fill-white"
								onClick={() => handlePlayPauseAudio(!state.playing)}
								disabled={!state.spotifyPlayerReady}
							>
								{!state.spotifyPlayerReady ? "\u23F3" : state.playing ? "\u23F8" : "\u23F5"}
							</button>
							<button
								type="button"
								title="Skip Forward"
								className="rounded-sm p-2 text-white"
								onClick={() => dispatch({ type: "skipped_forward", playtree: playtree, edgeRand: Math.random(), selectorRand: Math.random() })}>{"\u23ED"}</button>
						</div>
						<div className="w-fit mx-auto">
							<button
								type="button"
								title="Next Playhead"
								className="rounded-sm p-2 text-white"
								onClick={() => dispatch({ type: "incremented_playhead", playtree: playtree })}>
								{"\u23EC"}
							</button>
						</div>
					</div>
				</div>
				<div className="w-full mr-8 my-auto text-white font-lilitaOne">
					<table>
						<tbody>
							<tr><td>Playtree</td><td>|</td><td>{playtree.summary.name}</td></tr>
							<tr><td>Playhead</td><td>|</td><td>{currentPlayhead ? currentPlayhead.name : "Playhead not available"}</td></tr>
							<tr><td>Playnode</td><td>|</td><td>{currentPlaynode ? currentPlaynode.name + (currentNodePlaycount !== undefined ? ` (${currentNodePlaycount + 1} / ${currentNodeMaxPlays})` : "") : "Playnode not available"}</td></tr>
							<tr><td>Song</td><td>|</td><td>{currentContent ? currentContent.name + (currentContentPlaycount !== undefined ? ` (${currentContentPlaycount + 1} / ${currentContentMaxPlays})` : "") : "Song not available"}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		)
	}
}
