package main

import (
	"encoding/json"
	"errors"
	"io"

	"github.com/go-playground/validator/v10"
)

type (
	ContentInfo struct {
		Type string `json:"type" validate:"required,oneof=local-audio spotify-track spotify-playlist"`
		URI  string `json:"uri" validate:"required"`
	}

	PlayEdgeInfo struct {
		NodeID string `json:"nodeID" validate:"required"`
		Shares int    `json:"shares,omitempty" validate:"omitempty,min=0"`
		Repeat int    `json:"repeat,omitempty"`
	}

	PlayNodeInfo struct {
		ID      string         `json:"id" validate:"required"`
		Name    string         `json:"name" validate:"required"`
		Type    string         `json:"type" validate:"required,oneof=sequence selector"`
		Content []ContentInfo  `json:"content" validate:"required"`
		Next    []PlayEdgeInfo `json:"next,omitempty"`
	}

	SourceInfo struct {
		Type string `json:"type" validate:"required,oneof=graft starter"`
		ID   string `json:"id" validate:"required"`
	}

	SummaryInfo struct {
		ID        string      `json:"id" validate:"required"`
		Name      string      `json:"name" validate:"required"`
		CreatedBy string      `json:"createdBy" validate:"required"`
		Access    string      `json:"access" validate:"required,oneof=private public"`
		Source    *SourceInfo `json:"source,omitempty"`
	}

	PartialSummaryInfo struct {
		Name      string `json:"name" validate:"required"`
		CreatedBy string `json:"createdBy" validate:"required"`
		Access    string `json:"access" validate:"required,oneof=private public"`
	}

	PlayheadInfo struct {
		Name   string `json:"name" validate:"required"`
		NodeID string `json:"nodeID" validate:"required"`
	}

	PlaytreeInfo struct {
		Summary   SummaryInfo             `json:"summary" validate:"required"`
		Nodes     map[string]PlayNodeInfo `json:"nodes" validate:"required"`
		Playroots []PlayheadInfo          `json:"playroots" validate:"required"`
	}
)

func (pei *PlayEdgeInfo) UnmarshalJSON(data []byte) error {
	type PlayEdgeInfo2 struct {
		NodeID string `json:"nodeID" validate:"required"`
		Shares int    `json:"shares,omitempty" validate:"omitempty,min=0"`
		Repeat int    `json:"repeat,omitempty"`
	}

	pei2 := &PlayEdgeInfo2{
		NodeID: "",
		Shares: 1,
		Repeat: -1,
	}
	err := json.Unmarshal(data, pei2)
	if err != nil {
		return err
	}
	pei.NodeID = pei2.NodeID
	pei.Shares = pei2.Shares
	pei.Repeat = pei2.Repeat
	return nil
}

func partialSummaryInfoFromJSON(r io.Reader) (*PartialSummaryInfo, error) {
	decoder := json.NewDecoder(r)
	decoder.DisallowUnknownFields()
	var psi PartialSummaryInfo
	err := decoder.Decode(&psi)
	if err != nil {
		return nil, err
	}

	v := validator.New()

	if validationErr := v.Struct(psi); validationErr != nil {
		return nil, validationErr
	}

	return &psi, nil
}

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
		for _, content := range node.Content {
			if contentValidationErr := v.Struct(content); contentValidationErr != nil {
				return nil, contentValidationErr
			}
		}
		for _, edge := range node.Next {
			if nextValidationErr := v.Struct(edge); nextValidationErr != nil {
				return nil, nextValidationErr
			}
		}
	}
	for _, playhead := range pti.Playroots {
		if playheadValidationErr := v.Struct(playhead); playheadValidationErr != nil {
			return nil, playheadValidationErr
		}
	}
	return &pti, nil
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
		songs := []*Song{}
		for _, content := range pni.Content {
			songs = append(songs, &Song{Filename: content.URI, Stopped: false, Command: nil})
		}
		switch pni.Type {
		case "sequence":
			content = &Sequence{
				Songs: songs,
			}
		case "selector":
			content = &Selector{
				Songs: songs,
			}
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
		}
	}

	// second pass
	//  - hook up all "next" nodes and keep track of a node's parents
	//  - validate that all outgoing nodes are defined
	for _, pni := range pti.Nodes {
		playNode := playNodesByID[pni.ID]

		if pni.Next != nil {
			pes := []*PlayEdge{}
			for _, pei := range pni.Next {
				nextNode, nextNodeFound := playNodesByID[pei.NodeID]
				if !nextNodeFound {
					return nil, errors.New(`JSON Playtree graph: undefined node "` + pei.NodeID + `"`)
				}

				pes = append(pes, &PlayEdge{Node: nextNode, Shares: pei.Shares, Repeat: pei.Repeat})
			}
			playNode.Next = pes
		}
	}

	pt := &Playtree{
		CreatedBy: pti.Summary.CreatedBy,
		Playheads: []*Playhead{},
	}

	serializedPlayheads := make(map[string]string)
	for _, playhead := range pti.Playroots {
		_, found := serializedPlayheads[playhead.NodeID]
		if found {
			return nil, errors.New(`JSON Playtree graph: multiple playheads assigned to the same play node`)
		}
		serializedPlayheads[playhead.NodeID] = playhead.Name
	}

	// third pass
	for nodeId, name := range serializedPlayheads {
		pt.Playheads = append(pt.Playheads, &Playhead{
			Name:      name,
			Node:      playNodesByID[nodeId],
			NodeIndex: 0,
		})
	}

	return pt, nil
}
