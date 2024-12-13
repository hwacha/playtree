package main

import (
	"errors"
	"flag"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	runCliPtr := flag.Bool("c", false, "if this flag is set to true, a music player will run on the command line.")
	flag.Parse()

	if *runCliPtr {
		godotenv.Load()
		if flag.NArg() != 1 {
			panic(errors.New("no filename for playtree file to play"))
		}
		file, err := os.Open(flag.Arg(0))
		if err != nil {
			panic(err)
		}
		pti, ptierr := playtreeInfoFromJSON(file)
		if ptierr != nil {
			panic(ptierr)
		}
		file.Close()
		pt, pterr := playtreeFromPlaytreeInfo(*pti)
		if pterr != nil {
			panic(pterr)
		}
		action := make(chan Action)
		go getActions(action)
		pt.Play(action)
		return
	}

	runServer()
}
