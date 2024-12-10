package main

import (
	"encoding/json"
	"errors"
	"io"

	"github.com/go-playground/validator/v10"
)

type (
	ContentInfo struct {
		Path string `json:"path" validate:"required"`
	}

	RepeatInfo struct {
		Times int    `json:"times" validate:"required"`
		From  string `json:"from" validate:"required_unless=Times 0"`
	}

	NodeAndProbabilityInfo struct {
		Node        string  `json:"node" validate:"required"`
		Probability float64 `json:"probability,omitempty"`
	}

	PlayNodeInfo struct {
		ID      string                   `json:"id" validate:"required"`
		Type    string                   `json:"type" validate:"required,oneof=song"`
		Content ContentInfo              `json:"content" validate:"required"`
		Repeat  RepeatInfo               `json:"repeat,omitempty" validate:"omitempty"`
		Next    []NodeAndProbabilityInfo `json:"next,omitempty"`
	}

	SourceInfo struct {
		Type string `json:"type" validate:"required,oneof=graft starter"`
		ID   string `json:"id" validate:"required"`
	}

	UserInfo struct {
		ID   string `json:"id" validate:"required"`
		Name string `json:"name" validate:"required"`
	}

	SummaryInfo struct {
		ID        string      `json:"id" validate:"required"`
		Name      string      `json:"name" validate:"required"`
		CreatedBy UserInfo    `json:"createdBy" validate:"required"`
		Source    *SourceInfo `json:"source,omitempty"`
	}

	PlayheadInfo struct {
		Name   string `json:"name" validate:"required"`
		NodeID string `json:"nodeID" validate:"required"`
	}

	PlaytreeInfo struct {
		Summary   SummaryInfo    `json:"summary" validate:"required"`
		Nodes     []PlayNodeInfo `json:"nodes" validate:"required"`
		Playheads []PlayheadInfo `json:"playheads" validate:"required"`
	}
)

func playtreeInfoFromJSON(r io.Reader) (*PlaytreeInfo, error) {
	decoder := json.NewDecoder(r)
	decoder.DisallowUnknownFields()
	var pti PlaytreeInfo
	err := decoder.Decode(&pti)
	if err != nil {
		return nil, err
	}
	v := validator.New()

	if validationErr := v.Struct(pti); validationErr != nil {
		return nil, validationErr
	}
	for _, node := range pti.Nodes {
		if nodeValidationErr := v.Struct(node); nodeValidationErr != nil {
			return nil, nodeValidationErr
		}
	}
	for _, playhead := range pti.Playheads {
		if playheadValidationErr := v.Struct(playhead); playheadValidationErr != nil {
			return nil, playheadValidationErr
		}
	}
	return &pti, nil
}

// first return value: true if
// - there is a "NEXT" node that points to an ancestor
// second return value: true if
// - there is a "REPEAT:FROM" node in that points to an ancestor
// OR
// - "REPEAT:FROM" is nil
func hasReferencesToAncestor(node *PlayNode, parents map[*PlayNode]map[*PlayNode]bool) (bool, bool) {
	hasOneNextReference, hasOneFromReference := false, node.Repeat.From == nil
	visitedNodes := make(map[*PlayNode]bool)
	for queue := []*PlayNode{node}; len(queue) != 0; queue = queue[1:] {
		ancestor := queue[0]
		visitedNodes[ancestor] = true
		if node.Repeat.From == ancestor {
			hasOneFromReference = true
		}
		for nextNode := range node.Next {
			if nextNode == ancestor {
				hasOneNextReference = true
				break
			}
		}
		if hasOneFromReference && hasOneNextReference {
			break
		}

		for parent := range parents[ancestor] {
			if _, visited := visitedNodes[parent]; !visited {
				queue = append(queue, parent)
			}
		}
	}

	return hasOneNextReference, hasOneFromReference
}

func playtreeFromPlaytreeInfo(pti PlaytreeInfo) (*Playtree, error) {
	// first, make a map from ID -> unconnected PlayNode
	playNodesByID := make(map[string]*PlayNode)

	// first pass
	// - make all the nodes with no edges for "next" or "repeat"
	// - add them to the ID map
	// - validate no duplicate IDs
	for _, pni := range pti.Nodes {
		// id
		id := pni.ID

		// song
		var content Playable
		switch pni.Type {
		case "song":
			content = &Song{Path: pni.Content.Path, Command: nil}
		default:
			return nil, errors.New(`JSON Playtree parse: unexpected type "` + pni.Type + `"`)
		}

		_, nodeAlreadyExists := playNodesByID[id]
		if nodeAlreadyExists {
			return nil, errors.New(`JSON Playtree parse: duplicate ID "` + id + "`")
		}

		playNodesByID[id] = &PlayNode{
			id:      id,
			Content: content,
			Repeat:  Repeat{Times: pni.Repeat.Times},
		}
	}

	parents := make(map[*PlayNode]map[*PlayNode]bool)
	// second pass
	//  - hook up all "next" nodes and keep track of a node's parents
	//  - hook up all "from" nodes in repeat
	//  - validate that all outgoing nodes are defined
	for _, pni := range pti.Nodes {
		playNode := playNodesByID[pni.ID]

		if pni.Repeat.From != "" {
			fromNode, fromNodeFound := playNodesByID[pni.Repeat.From]
			if !fromNodeFound {
				return nil, errors.New(`JSON Playtree graph: undefined node "` + pni.Repeat.From + `"`)
			}
			playNode.Repeat.From = fromNode
		}

		if pni.Next != nil {
			nodesWithUnmarkedProbabilities := []*PlayNode{}
			nodesWithMarkedProbabilities := make(PlayNodeProbabilityDistribution)
			for _, napi := range pni.Next {
				nextNode, nextNodeFound := playNodesByID[napi.Node]
				if !nextNodeFound {
					return nil, errors.New(`JSON Playtree graph: undefined node "` + napi.Node + `"`)
				}
				if _, found := parents[nextNode]; !found {
					parents[nextNode] = make(map[*PlayNode]bool)
				}

				parents[nextNode][playNode] = true

				if napi.Probability == 0 {
					nodesWithUnmarkedProbabilities = append(nodesWithUnmarkedProbabilities, nextNode)
				} else {
					nodesWithMarkedProbabilities[nextNode] = napi.Probability
				}
			}
			pd, pdErr := makeProbabilityDistributionFrom(nodesWithUnmarkedProbabilities, nodesWithMarkedProbabilities)
			if pdErr != nil {
				return nil, pdErr
			}
			playNode.Next = pd
		}
	}

	pt := &Playtree{
		CreatedBy: User{
			id:   pti.Summary.CreatedBy.ID,
			Name: pti.Summary.CreatedBy.Name,
		},
		Playheads: []*Playhead{},
	}

	serializedPlayheads := make(map[string]string)
	for _, playhead := range pti.Playheads {
		_, found := serializedPlayheads[playhead.NodeID]
		if found {
			return nil, errors.New(`JSON Playtree graph: multiple playheads assigned to the same play node`)
		}
		serializedPlayheads[playhead.NodeID] = playhead.Name
	}

	// third pass
	//  - validate that "next" edges form a DAG
	//  - validate that "repeat" edges all point to an ancestor
	//  - if a node has no parents, assign it to a playhead
	//  - validate all and only valid playheads exist are named
	for _, playNode := range playNodesByID {
		hasOneNextReference, hasOneFromReference := hasReferencesToAncestor(playNode, parents)
		if hasOneNextReference {
			return nil, errors.New(`JSON Playtree graph: cycle detected in node graph via the "next" field (playtree should be a DAG)`)
		}
		if !hasOneFromReference {
			return nil, errors.New(`JSON Playtree graph: node to repeat from must be one of the node's ancestors`)
		}

		if parents[playNode] == nil || len(parents[playNode]) == 0 {
			playheadName, found := serializedPlayheads[playNode.id]
			if !found {
				return nil, errors.New(`JSON Playtree graph: root node "` + playNode.id + `" does not have a named playhead`)
			}
			pt.Playheads = append(pt.Playheads, &Playhead{
				Name: serializedPlayheads[playheadName],
				Node: playNode,
			})
		}

		if len(pti.Playheads) > len(pt.Playheads) {
			return nil, errors.New(`JSON Playtree graph: some named playheads refer to non-existent nodes, or nodes that aren't roots`)
		}
	}

	return pt, nil
}
