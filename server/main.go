package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"slices"
	"syscall"
)

type PlayNodeProbabilityDistribution map[*PlayNode]float64

func makeUniformProbabilityDistributionFrom(pns []*PlayNode, unconditionedProbability float64) PlayNodeProbabilityDistribution {
	var oneOverN float64 = unconditionedProbability / float64(len(pns))

	pnpd := make(map[*PlayNode]float64)
	for _, pn := range pns {
		pnpd[pn] = oneOverN
	}
	return pnpd
}

func isValidPartialProbabilityDistribution(pnpd PlayNodeProbabilityDistribution) (float64, bool) {
	var sum float64 = 0
	for _, probability := range pnpd {
		sum += probability
	}
	return sum, sum < 1.0
}

func isValidTotalProbabilityDistribution(pnpd PlayNodeProbabilityDistribution) bool {
	var sum float64 = 0
	for _, probability := range pnpd {
		sum += probability
	}
	const epsilon = 1e-9
	return math.Abs(1.0-sum) <= epsilon
}

func makeProbabilityDistributionFrom(unmarkedProbabilities []*PlayNode, markedProbabilities PlayNodeProbabilityDistribution) (PlayNodeProbabilityDistribution, error) {
	if len(unmarkedProbabilities) == 0 && len(markedProbabilities) == 0 {
		return nil, nil
	}

	if len(markedProbabilities) == 0 {
		return makeUniformProbabilityDistributionFrom(unmarkedProbabilities, 1.0), nil
	}

	if len(unmarkedProbabilities) == 0 {
		if isValidTotalProbabilityDistribution(markedProbabilities) {
			return markedProbabilities, nil
		} else {
			return nil, errors.New("probability distribution: when there are only marked probabilities, they must sum to 1")
		}
	}

	sumOfMarkedProbabilities, valid := isValidPartialProbabilityDistribution(markedProbabilities)
	if !valid {
		return nil, errors.New("probability distribution: when there are unmarked probabilities present, the sum of marked probabilities must be < 1")
	}

	unmarkedProbabilityDistribution := makeUniformProbabilityDistributionFrom(unmarkedProbabilities, 1.0-sumOfMarkedProbabilities)

	totalProbabilities := make(PlayNodeProbabilityDistribution)
	for node, pr := range unmarkedProbabilityDistribution {
		totalProbabilities[node] = pr
	}
	for node, pr := range markedProbabilities {
		totalProbabilities[node] = pr
	}
	return totalProbabilities, nil
}

func randomlySelectNextPlayNode(pnpd PlayNodeProbabilityDistribution) *PlayNode {
	if pnpd == nil {
		return nil
	}

	r := rand.Float64()
	var upperBound float64 = 0
	for playNode, probability := range pnpd {
		upperBound += probability
		if r < upperBound {
			return playNode
		}
	}
	return nil
}

type Playable interface {
	// IsDoneOnSkipToPrev() bool
	// IsDoneOnSkipToNext() bool

	Start(<-chan bool, <-chan bool, chan<- bool)
	Play(chan<- bool)
	// Pause()
	Stop()
	Skip(chan<- bool)
}

type Song struct {
	Path    string
	Stopped bool
	Command *exec.Cmd
}

func (song *Song) Start(play <-chan bool, skip <-chan bool, done chan<- bool) {
	for {
		// if the song is stopped at this song,
		// wait until you receive a play or skip signal
		if song.Stopped {
			select {
			case <-play:
				break
			case <-skip:
				song.Stopped = false
				done <- true
				return
			}
		}

		fmt.Println("NOW PLAYING", song.Path)
		song.Command = exec.Command("afplay", os.Getenv("AUDIO_PATH")+song.Path)
		song.Command.Run()

		if !song.Stopped {
			break
		}
	}

	done <- true
}

func (song *Song) Play(play chan<- bool) {
	play <- true
	song.Stopped = false
}

func (song *Song) Stop() {
	if !song.Stopped {
		song.Stopped = true
		song.Command.Process.Signal(syscall.SIGINT)
		fmt.Println("STOPPED AND REWOUND", song.Path)
	}
}

func (song *Song) Skip(skip chan<- bool) {
	if song.Stopped {
		song.Stopped = false
		skip <- true
	} else {
		song.Command.Process.Signal(syscall.SIGINT)
	}
}

type Repeat struct {
	Times   int // -1 loops forever, 0 passes, 1 or more repeats
	From    *PlayNode
	Counter int
}

type PlayNode struct {
	id      string
	Type    string
	Content Playable
	Repeat  Repeat
	Next    PlayNodeProbabilityDistribution
}

type User struct {
	id   string
	Name string
}

type Playhead struct {
	Name string
	Node *PlayNode
}

type Playtree struct {
	CreatedBy User
	Playheads []*Playhead
}

func (pt *Playtree) Play(action <-chan Action) {
	// initialize history - 1st index is playhead index. Second is history stack
	history := [][]*PlayNode{}
	for range len(pt.Playheads) {
		history = append(history, []*PlayNode{})
	}

	playheadIndex := 0
	fmt.Println("STARTING AT PLAYHEAD", pt.Playheads[playheadIndex].Name)

StartPlayhead:
	for slices.ContainsFunc(pt.Playheads, func(pn *Playhead) bool { return pn.Node != nil }) {
		hadToDefault := false
		for pt.Playheads[playheadIndex].Node == nil {
			playheadIndex++
			playheadIndex %= len(pt.Playheads)
			hadToDefault = true
		}
		if hadToDefault {
			fmt.Println("DEFAULTING TO PLAYHEAD", pt.Playheads[playheadIndex+1].Name)
		}
		// play song at playhead
		done, play, skip := make(chan bool), make(chan bool), make(chan bool)
		go pt.Playheads[playheadIndex].Node.Content.Start(play, skip, done)

		readyForNextSong := false
		for !readyForNextSong {
			select {
			case curAction := <-action:
				switch curAction {
				case ActionPlay:
					pt.Playheads[playheadIndex].Node.Content.Play(play)
				case ActionStop:
					pt.Playheads[playheadIndex].Node.Content.Stop()
				case ActionNext:
					pt.Playheads[playheadIndex].Node.Content.Skip(skip)
					fmt.Println("SKIPPING TO NEXT")
				case ActionBack:
					if len(history[playheadIndex]) == 0 {
						pt.Playheads[playheadIndex].Node.Content.Stop()
					} else {
						pt.Playheads[playheadIndex].Node.Content.Skip(skip)
						pt.Playheads[playheadIndex].Node = history[playheadIndex][len(history[playheadIndex])-1]
						history[playheadIndex] = history[playheadIndex][:len(history[playheadIndex])-1]
						fmt.Println("SKIPPING BACK")
						goto StartPlayhead
					}
				case ActionLeft:
					pt.Playheads[playheadIndex].Node.Content.Skip(skip)
					playheadIndex--
					if playheadIndex < 0 {
						playheadIndex += len(pt.Playheads)
					}
					fmt.Println("MOVING LEFT TO PLAYHEAD", pt.Playheads[playheadIndex+1].Name)
					goto StartPlayhead
				case ActionRight:
					pt.Playheads[playheadIndex].Node.Content.Skip(skip)
					playheadIndex++
					playheadIndex %= len(pt.Playheads)
					fmt.Println("MOVING RIGHT TO PLAYHEAD", pt.Playheads[playheadIndex+1].Name)
					goto StartPlayhead
				}

			case <-done:
				readyForNextSong = true
			}
		}

		// repeat if should loop forever
		if pt.Playheads[playheadIndex].Node.Repeat.Times < 0 {
			pt.Playheads[playheadIndex].Node = pt.Playheads[playheadIndex].Node.Repeat.From
			continue
		}

		// increment play counter if should repeat X times
		if pt.Playheads[playheadIndex].Node.Repeat.Counter < pt.Playheads[playheadIndex].Node.Repeat.Times {
			pt.Playheads[playheadIndex].Node.Repeat.Counter++
			if pt.Playheads[playheadIndex].Node != pt.Playheads[playheadIndex].Node.Repeat.From {
				pt.Playheads[playheadIndex].Node = pt.Playheads[playheadIndex].Node.Repeat.From
			}
			continue
		}

		history[playheadIndex] = append(history[playheadIndex], pt.Playheads[playheadIndex].Node)
		pt.Playheads[playheadIndex].Node = randomlySelectNextPlayNode(pt.Playheads[playheadIndex].Node.Next)
	}
	fmt.Println("PLAYHEADS ALL FINISHED")
}

type Action int

const (
	ActionPlay Action = iota
	ActionStop
	ActionNext
	ActionBack
	ActionLeft
	ActionRight
)

func getActions(action chan<- Action) {
	for {
		var line string
		fmt.Scanln(&line)
		switch line {
		case "p":
			action <- ActionPlay
		case "s":
			action <- ActionStop
		case "n":
			action <- ActionNext
		case "b":
			action <- ActionBack
		case "l":
			action <- ActionLeft
		case "r":
			action <- ActionRight
		default:
			continue
		}
	}
}

func handleGetPlaytrees(w http.ResponseWriter, r *http.Request) {
	dirPath := "playtrees"

	files, err := os.ReadDir(dirPath)
	if err != nil {
		log.Println("Error reading directory:", err)
		return
	}

	summaries := []SummaryInfo{}
	for _, dirEntry := range files {
		var file, err = os.Open(dirPath + "/" + dirEntry.Name())
		if err != nil {
			log.Println("Error opening file:", err)
			return
		}
		defer file.Close()

		var pti PlaytreeInfo
		decoder := json.NewDecoder(file)
		err = decoder.Decode(&pti)
		if err != nil {
			log.Println("Error decoding JSON:", err)
		}

		summaries = append(summaries, pti.Summary)
	}

	encoder := json.NewEncoder(w)
	err = encoder.Encode(summaries)
	if err != nil {
		log.Println("Error encoding JSON", err)
	}
}

func handleCreatePlaytree(w http.ResponseWriter, r *http.Request) {
	// validate playtree JSON given in body
	pti, invalidPlaytreeJsonErr := playtreeInfoFromJSON(r.Body)

	if invalidPlaytreeJsonErr != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, invalidPlaytreeJsonErr)
		return
	}

	_, playtreeErr := playtreeFromPlaytreeInfo(*pti)
	if playtreeErr != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, playtreeErr)
		return
	}

	// check if there's a JSON file named <id>.json. Respond with "already exists" error if so
	// TODO: use database instead
	idDotJson := "./playtrees/" + pti.Summary.ID + ".json"
	if _, err := os.Stat(idDotJson); !errors.Is(err, os.ErrNotExist) {
		w.WriteHeader(http.StatusConflict)
		fmt.Fprint(w, `Playtree with ID "`+pti.Summary.ID+`" already exists`)
		return
	}

	// otherwise, create JSON file <id>.json with body contents, return Created
	file, fileCreateErr := os.Create(idDotJson)
	if fileCreateErr != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "Could not create playtree file")
		return
	}

	writeErr := json.NewEncoder(file).Encode(pti)
	if writeErr != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, writeErr)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func handleEditPlaytree(w http.ResponseWriter, r *http.Request) {
	// check if file already exists. if not, 404 error.
	id := r.PathValue("id")
	idDotJson := "./playtrees/" + id + ".json"

	file, openErr := os.OpenFile(idDotJson, os.O_WRONLY|os.O_TRUNC, 0644)
	if openErr != nil {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, `Playtree with ID "`+id+`" does not exist`)
		return
	}
	defer file.Close()

	// validate playtree JSON given in body
	pti, invalidPlaytreeJsonErr := playtreeInfoFromJSON(r.Body)

	if invalidPlaytreeJsonErr != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, invalidPlaytreeJsonErr)
		return
	}

	_, playtreeErr := playtreeFromPlaytreeInfo(*pti)
	if playtreeErr != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, playtreeErr)
		return
	}

	// write updated playtree to file
	writeToFileErr := json.NewEncoder(file).Encode(pti)
	if writeToFileErr != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "Could not update playtree resource")
		log.Println(writeToFileErr)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func handleDeletePlaytree(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	err := os.Remove("./playtrees/" + id + ".json")
	if err != nil {
		// TODO: more informative error message and HTTP status
		if errors.Is(err, os.ErrNotExist) {
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, "Playtree does not exist")
		} else {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, `Could not remove playtree "`+id+`"`)
		}
		log.Print(err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

var currentlyPlaying *string = nil

func handleGetCurrentlyPlaying(w http.ResponseWriter, r *http.Request) {
	if currentlyPlaying == nil {
		fmt.Fprint(w, "null")
		return
	}
	data, readErr := os.ReadFile("./playtrees/" + *currentlyPlaying + ".json")
	if readErr != nil {
		if errors.Is(readErr, os.ErrNotExist) {
			w.WriteHeader(http.StatusNotFound)
		} else if errors.Is(readErr, os.ErrPermission) {
			w.WriteHeader(http.StatusForbidden)
		} else {
			w.WriteHeader(http.StatusInternalServerError)
		}
		log.Println(readErr)
		fmt.Fprint(w, readErr.Error())
	}
	fmt.Fprint(w, string(data))
}

func handleSetCurrentlyPlaying(w http.ResponseWriter, r *http.Request) {
	id := r.FormValue("playtree")

	_, readErr := os.ReadFile("./playtrees/" + id + ".json")
	if readErr != nil {
		if errors.Is(readErr, os.ErrNotExist) {
			w.WriteHeader(http.StatusNotFound)
		} else if errors.Is(readErr, os.ErrPermission) {
			w.WriteHeader(http.StatusForbidden)
		} else {
			w.WriteHeader(http.StatusInternalServerError)
		}
		fmt.Fprint(w, readErr.Error())
	}
	currentlyPlaying = &id
	w.WriteHeader(http.StatusCreated)
}

func main() {
	// Get all playtrees
	http.HandleFunc("GET /playtrees", handleGetPlaytrees)

	http.HandleFunc("POST /playtrees", handleCreatePlaytree)
	http.HandleFunc("PUT /playtrees/{id}", handleEditPlaytree)
	http.HandleFunc("DELETE /playtrees/{id}", handleDeletePlaytree)

	// Get and set player
	http.HandleFunc("GET /me/player", handleGetCurrentlyPlaying)
	http.HandleFunc("PUT /me/player", handleSetCurrentlyPlaying)

	fmt.Println("Server listening on http://localhost:8080/")
	http.ListenAndServe(":8080", nil)
}
