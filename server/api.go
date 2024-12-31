package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
)

var currentlyPlaying *string = nil

var handlers = map[string]func(http.ResponseWriter, *http.Request){
	"GET /playtrees": func(w http.ResponseWriter, r *http.Request) {
		dirPath := "playtrees/"

		files, err := os.ReadDir(dirPath)
		if err != nil {
			log.Println("Error reading directory:", err)
			return
		}

		summaries := []SummaryInfo{}
		for _, dirEntry := range files {
			if !strings.HasSuffix(dirEntry.Name(), ".json") {
				continue
			}
			var file, err = os.Open(dirPath + dirEntry.Name())
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
	},
	"POST /playtrees": func(w http.ResponseWriter, r *http.Request) {
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
	},
	"GET /playtrees/{id}": func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		idDotJson := "./playtrees/" + id + ".json"

		file, openErr := os.Open(idDotJson)
		if openErr != nil {
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, `Playtree with ID "`+id+`" does not exist`)
			return
		}

		file.WriteTo(w)
	},
	"PUT /playtrees/{id}": func(w http.ResponseWriter, r *http.Request) {
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
	},
	"DELETE /playtrees/{id}": func(w http.ResponseWriter, r *http.Request) {
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
	},
	"GET /me/player": func(w http.ResponseWriter, r *http.Request) {
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
	},
	"PUT /me/player": func(w http.ResponseWriter, r *http.Request) {
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
			log.Println(readErr.Error())
			return
		}
		currentlyPlaying = &id
		w.WriteHeader(http.StatusNoContent)
	},
}

func runServer() {
	for route, handler := range handlers {
		http.HandleFunc(route, handler)
	}
	fmt.Println("Server listening on http://localhost:8080/")
	http.ListenAndServe(":8080", nil)
}
