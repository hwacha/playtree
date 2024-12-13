package main

import (
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"slices"
	"syscall"
)

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
	Filename string
	Stopped  bool
	Command  *exec.Cmd
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

		fmt.Println("NOW PLAYING", song.Filename)
		song.Command = exec.Command("afplay", os.Getenv("AUDIO_PATH")+song.Filename)
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
		fmt.Println("STOPPED AND REWOUND", song.Filename)
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
	Name string
	Node *PlayNode
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
			fmt.Println("DEFAULTING TO PLAYHEAD", pt.Playheads[playheadIndex].Name)
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
					fmt.Println("MOVING LEFT TO PLAYHEAD", pt.Playheads[playheadIndex].Name)
					goto StartPlayhead
				case ActionRight:
					pt.Playheads[playheadIndex].Node.Content.Skip(skip)
					playheadIndex++
					playheadIndex %= len(pt.Playheads)
					fmt.Println("MOVING RIGHT TO PLAYHEAD", pt.Playheads[playheadIndex].Name)
					goto StartPlayhead
				}

			case <-done:
				readyForNextSong = true
			}
		}

		history[playheadIndex] = append(history[playheadIndex], pt.Playheads[playheadIndex].Node)
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
