package main

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/go-playground/validator/v10"
)

type (
	PlayitemType struct {
		Source    string `json:"source" validate:"oneof=local spotify youtube"`
		Plurality string `json:"plurality" validate:"oneof=single collection"`
	}

	Playitem struct {
		ID         string       `json:"id" validate:"required"`
		Type       PlayitemType `json:"type" validate:"required"`
		URI        string       `json:"uri" validate:"required"`
		CreatorURI string       `json:"creatorURI" validate:"required"`
		Name       string       `json:"name" validate:"required"`
		Creator    string       `json:"creator" validate:"required"`
		Exponent   int          `json:"exponent" validate:"min=0"`
		Multiplier int          `json:"multiplier" validate:"min=0"`
		Limit      int          `json:"limit" validate:"min=-1"`
	}

	Playedge struct {
		TargetID string `json:"targetID" validate:"required"`
		Priority int    `json:"priority" validate:"min=0"`
		Shares   int    `json:"shares" validate:"min=0"`
		Limit    int    `json:"limit" validate:"min=-1"`
	}

	Position struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}

	Playnode struct {
		ID         string     `json:"id" validate:"required"`
		Position   Position   `json:"position" validate:"required"`
		Type       string     `json:"type" validate:"required,oneof=sequencer selector simulplexer"`
		Name       string     `json:"name" validate:"required"`
		Repeat     int        `json:"repeat" validate:"min=0"`
		Limit      int        `json:"limit" validate:"min=-1"`
		Playscopes []int      `json:"playscopes" validate:"required,min=0"`
		Playitems  []Playitem `json:"playitems" validate:"required"`
		Next       []Playedge `json:"next,omitempty"`
	}

	Summary struct {
		ID        string `json:"id" validate:"required"`
		Name      string `json:"name" validate:"required"`
		CreatedBy string `json:"createdBy" validate:"required"`
		Access    string `json:"access" validate:"required,oneof=private public"`
	}

	PartialSummary struct {
		Name      string `json:"name" validate:"required"`
		CreatedBy string `json:"createdBy" validate:"required"`
		Access    string `json:"access" validate:"required,oneof=private public"`
	}

	Playhead struct {
		Index int    `json:"index"`
		Name  string `json:"name" validate:"required"`
	}

	Playscope struct {
		ID    int    `json:"id" validate:"required"`
		Name  string `json:"name" validate:"required"`
		Color string `json:"color" validate:"required"`
	}

	Playtree struct {
		Summary    Summary             `json:"summary" validate:"required"`
		Playnodes  map[string]Playnode `json:"playnodes" validate:"required"`
		Playroots  map[string]Playhead `json:"playroots" validate:"required"`
		Playscopes []Playscope         `json:"playscopes" validate:"required"`
	}
)

func (ci *Playitem) UnmarshalJSON(data []byte) error {
	type PlayitemTmp struct {
		ID         string       `json:"id" validate:"required"`
		Type       PlayitemType `json:"type" validate:"required"`
		URI        string       `json:"uri" validate:"required"`
		CreatorURI string       `json:"creatorURI" validate:"required"`
		Name       string       `json:"name" validate:"required"`
		Creator    string       `json:"creator" validate:"required"`
		Exponent   int          `json:"exponent" validate:"required"`
		Multiplier int          `json:"multiplier" validate:"min=0"`
		Limit      int          `json:"limit" validate:"min=-1"`
	}

	ci2 := &PlayitemTmp{
		Exponent:   0,
		Multiplier: 1,
		Limit:      -1,
	}

	err := json.Unmarshal(data, ci2)
	if err != nil {
		return err
	}

	ci.ID = ci2.ID
	ci.Type = ci2.Type
	ci.URI = ci2.URI
	ci.CreatorURI = ci2.CreatorURI
	ci.Name = ci2.Name
	ci.Creator = ci2.Creator
	ci.Exponent = ci2.Exponent
	ci.Multiplier = ci2.Multiplier
	ci.Limit = ci2.Limit

	return nil
}

func (pni *Playnode) UnmarshalJSON(data []byte) error {
	type PlaynodeTmp struct {
		ID         string     `json:"id" validate:"required"`
		Position   Position   `json:"position" validate:"required"`
		Type       string     `json:"type" validate:"required,oneof=sequencer selector simulplexer"`
		Name       string     `json:"name" validate:"required"`
		Repeat     int        `json:"repeat" validate:"min=0"`
		Limit      int        `json:"limit" validate:"min=-1"`
		Playscopes []int      `json:"playscopes" validate:"required,min=0"`
		Playitems  []Playitem `json:"playitems" validate:"required"`
		Next       []Playedge `json:"next,omitempty"`
	}

	pni2 := &PlaynodeTmp{
		ID:         "",
		Position:   Position{X: 0, Y: 0},
		Name:       "",
		Type:       "",
		Repeat:     1,
		Limit:      -1,
		Playscopes: []int{},
		Playitems:  []Playitem{},
		Next:       []Playedge{},
	}

	err := json.Unmarshal(data, pni2)
	if err != nil {
		return err
	}

	pni.ID = pni2.ID
	pni.Position = pni2.Position
	pni.Name = pni2.Name
	pni.Type = pni2.Type
	pni.Limit = pni2.Limit
	pni.Playscopes = pni2.Playscopes
	pni.Playitems = pni2.Playitems
	pni.Next = pni2.Next

	return nil
}

func (pei *Playedge) UnmarshalJSON(data []byte) error {
	type PlayedgeTmp struct {
		TargetID string `json:"targetID" validate:"required"`
		Shares   int    `json:"shares,omitempty" validate:"omitempty,min=0"`
		Priority int    `json:"priority" validate:"omitempty,min=0"`
		Limit    int    `json:"limit,omitempty"`
	}

	pei2 := &PlayedgeTmp{
		TargetID: "",
		Shares:   1,
		Priority: 0,
		Limit:    -1,
	}
	err := json.Unmarshal(data, pei2)
	if err != nil {
		return err
	}
	pei.TargetID = pei2.TargetID
	pei.Shares = pei2.Shares
	pei.Priority = pei2.Priority
	pei.Limit = pei2.Limit

	return nil
}

func partialSummaryInfoFromJSON(r io.Reader) (*PartialSummary, error) {
	decoder := json.NewDecoder(r)
	decoder.DisallowUnknownFields()
	var psi PartialSummary
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

func playtreeInfoFromJSON(r io.Reader) (*Playtree, error) {
	decoder := json.NewDecoder(r)
	decoder.DisallowUnknownFields()
	var pti Playtree
	err := decoder.Decode(&pti)
	if err != nil {
		return nil, err
	}

	v := validator.New()

	if validationErr := v.Struct(pti); validationErr != nil {
		return nil, validationErr
	}

	for _, node := range pti.Playnodes {

		if nodeValidationErr := v.Struct(node); nodeValidationErr != nil {
			fmt.Println(nodeValidationErr)
			return nil, nodeValidationErr
		}
		for _, playitems := range node.Playitems {
			if playitemsValidationErr := v.Struct(playitems); playitemsValidationErr != nil {
				return nil, playitemsValidationErr
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
