package main

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/exec"
	"slices"
	"syscall"
)

type Playable interface {
	Start(int, chan<- int, <-chan bool, <-chan bool, chan bool)
	Play(int, chan<- bool)
	// Pause()
	Stop(int)
	Skip(int, chan<- bool)
}

type Sequence struct {
	Songs []*Song
}

func (sequence *Sequence) Start(index int, indexChan chan<- int, play <-chan bool, skip <-chan bool, done chan bool) {
	for i := index; i < len(sequence.Songs); i++ {
		indexChan <- i
		songDone := make(chan bool)
		go sequence.Songs[i].Start(i, indexChan, play, skip, songDone)
		<-songDone
	}
	done <- true
}

func (sequence *Sequence) Play(index int, play chan<- bool) {
	sequence.Songs[index].Play(index, play)
}

func (sequence *Sequence) Stop(index int) {
	sequence.Songs[index].Stop(index)
}

func (sequence *Sequence) Skip(index int, skip chan<- bool) {
	sequence.Songs[index].Skip(index, skip)
}

type Selector struct {
	Songs []*Song
}

func (sel *Selector) Start(_ int, indexChan chan<- int, play <-chan bool, skip <-chan bool, done chan bool) {
	selectedIndex := rand.Intn(len(sel.Songs))
	indexChan <- selectedIndex
	sel.Songs[selectedIndex].Start(selectedIndex, indexChan, play, skip, done)
}

func (sel *Selector) Play(index int, play chan<- bool) {
	sel.Songs[index].Play(index, play)
}

func (sel *Selector) Stop(index int) {
	sel.Songs[index].Stop(index)
}

func (sel *Selector) Skip(index int, skip chan<- bool) {
	sel.Songs[index].Skip(index, skip)
}

type Song struct {
	Filename string
	Stopped  bool
	Command  *exec.Cmd
}

func (song *Song) Start(_ int, _ chan<- int, play <-chan bool, skip <-chan bool, done chan bool) {
	for {
		// if we're stopped at this song,
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

		fmt.Println("NOW PLAYING", song.Filename)
		song.Command = exec.Command("afplay", os.Getenv("AUDIO_PATH")+song.Filename)
		song.Command.Run()

		if !song.Stopped {
			break
		}
	}
	log.Println("FINISHED SONG")
	done <- true
}

func (song *Song) Play(_ int, play chan<- bool) {
	play <- true
	song.Stopped = false
}

func (song *Song) Stop(_ int) {
	if !song.Stopped {
		song.Stopped = true
		song.Command.Process.Signal(syscall.SIGINT)
		fmt.Println("STOPPED AND REWOUND", song.Filename)
	}
}

func (song *Song) Skip(_ int, skip chan<- bool) {
	if song.Stopped {
		song.Stopped = false
		skip <- true
	} else {
		song.Command.Process.Signal(syscall.SIGINT)
	}
}

type PlayEdge struct {
	Node   *PlayNode
	Shares int
	Repeat int
}

type PlayNode struct {
	id      string
	Type    string
	Content Playable
	Next    []*PlayEdge
}

type User struct {
	id   string
	Name string
}

type Playhead struct {
	Name      string
	Node      *PlayNode
	NodeIndex int
}

type Playtree struct {
	CreatedBy User
	Playheads []*Playhead
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

func randomlySelectNextPlayEdge(pes []*PlayEdge, counters map[*PlayEdge]int) *PlayEdge {
	if pes == nil {
		return nil
	}

	elligiblePes := []*PlayEdge{}
	for _, pe := range pes {
		if (pe.Repeat < 0 || counters[pe] <= pe.Repeat) && pe.Shares > 0 {
			elligiblePes = append(elligiblePes, pe)
		}
	}

	if len(elligiblePes) == 0 {
		return nil
	}

	totalShares := 0
	for _, pe := range elligiblePes {
		totalShares += pe.Shares
	}

	r := rand.Intn(totalShares)
	upperBound := 0
	for _, pe := range elligiblePes {
		upperBound += pe.Shares
		if r < upperBound {
			return pe
		}

	}
	return nil
}

func (pt *Playtree) Play(action <-chan Action) {
	// initialize repeat counters
	counters := make(map[*PlayEdge]int)
	// initialize history - 1st index is playhead index. Second is history stack
	type HistoryNode struct {
		Node  *PlayNode
		Index int
	}
	history := [][]*HistoryNode{}
	for range len(pt.Playheads) {
		history = append(history, []*HistoryNode{})
	}

	playheadIndex := 0
	fmt.Println("STARTING AT PLAYHEAD", pt.Playheads[playheadIndex].Name)

StartPlayhead:
	for slices.ContainsFunc(pt.Playheads, func(pn *Playhead) bool { return pn.Node != nil }) {
		hadToDefault := false
		currentPlayhead := pt.Playheads[playheadIndex]
		for currentPlayhead.Node == nil {
			playheadIndex++
			playheadIndex %= len(pt.Playheads)
			currentPlayhead = pt.Playheads[playheadIndex]
			hadToDefault = true
		}
		if hadToDefault {
			fmt.Println("DEFAULTING TO PLAYHEAD", currentPlayhead.Name)
		}
		// play song at playhead
		indexChan, done, play, skip := make(chan int), make(chan bool), make(chan bool), make(chan bool)
		go currentPlayhead.Node.Content.Start(currentPlayhead.NodeIndex, indexChan, play, skip, done)
		index := <-indexChan

		readyForNextNode := false
		for !readyForNextNode {
			select {
			case curAction := <-action:
				switch curAction {
				case ActionPlay:
					pt.Playheads[playheadIndex].Node.Content.Play(index, play)
				case ActionStop:
					pt.Playheads[playheadIndex].Node.Content.Stop(index)
				case ActionNext:
					pt.Playheads[playheadIndex].Node.Content.Skip(index, skip)
					fmt.Println("SKIPPING TO NEXT")
				case ActionBack:
					if len(history[playheadIndex]) == 0 {
						pt.Playheads[playheadIndex].Node.Content.Stop(index)
					} else {
						pt.Playheads[playheadIndex].Node.Content.Skip(index, skip)
						lastNodeAndIndex := history[playheadIndex][len(history[playheadIndex])-1]
						pt.Playheads[playheadIndex].Node = lastNodeAndIndex.Node
						pt.Playheads[playheadIndex].NodeIndex = lastNodeAndIndex.Index
						history[playheadIndex] = history[playheadIndex][:len(history[playheadIndex])-1]
						fmt.Println("SKIPPING BACK")
						goto StartPlayhead
					}
				case ActionLeft:
					pt.Playheads[playheadIndex].Node.Content.Skip(index, skip)
					playheadIndex--
					if playheadIndex < 0 {
						playheadIndex += len(pt.Playheads)
					}
					fmt.Println("MOVING LEFT TO PLAYHEAD", pt.Playheads[playheadIndex].Name)
					goto StartPlayhead
				case ActionRight:
					pt.Playheads[playheadIndex].Node.Content.Skip(index, skip)
					playheadIndex++
					playheadIndex %= len(pt.Playheads)
					fmt.Println("MOVING RIGHT TO PLAYHEAD", pt.Playheads[playheadIndex].Name)
					goto StartPlayhead
				}
			case index = <-indexChan:
				history[playheadIndex] = append(history[playheadIndex], &HistoryNode{
					Node:  pt.Playheads[playheadIndex].Node,
					Index: pt.Playheads[playheadIndex].NodeIndex,
				})
				pt.Playheads[playheadIndex].NodeIndex = index
			case <-done:
				readyForNextNode = true
			}
		}

		history[playheadIndex] = append(history[playheadIndex], &HistoryNode{
			Node:  pt.Playheads[playheadIndex].Node,
			Index: pt.Playheads[playheadIndex].NodeIndex,
		})
		selectedEdge := randomlySelectNextPlayEdge(pt.Playheads[playheadIndex].Node.Next, counters)

		if selectedEdge == nil {
			pt.Playheads[playheadIndex].Node = nil
		} else {
			if selectedEdge.Repeat >= 0 {
				counter, found := counters[selectedEdge]

				if !found {
					counters[selectedEdge] = 1
				} else {
					fmt.Println(counters[selectedEdge])
					counters[selectedEdge] = counter + 1
				}
			}
			pt.Playheads[playheadIndex].Node = selectedEdge.Node
		}
	}
	fmt.Println("PLAYHEADS ALL FINISHED")
}
