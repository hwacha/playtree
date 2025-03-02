package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/google/uuid"
)

var currentlyPlaying *string = nil

func getAllPlaytreeSummaries() ([]Summary, error) {
	dirPath := "playtrees/"

	files, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	summaries := []Summary{}
	for _, dirEntry := range files {
		if !strings.HasSuffix(dirEntry.Name(), ".json") {
			continue
		}
		var file, err = os.Open(dirPath + dirEntry.Name())
		if err != nil {
			return nil, err
		}
		defer file.Close()

		var pti Playtree
		decoder := json.NewDecoder(file)
		err = decoder.Decode(&pti)
		if err != nil {
			return nil, err
		}
		summaries = append(summaries, pti.Summary)
	}

	return summaries, nil
}

var handlers = map[string]func(http.ResponseWriter, *http.Request){
	"GET /playtrees": func(w http.ResponseWriter, r *http.Request) {
		summaries, err := getAllPlaytreeSummaries()
		publicSummaries := []Summary{}

		for _, summary := range summaries {
			if summary.Access == "public" {
				publicSummaries = append(publicSummaries, summary)
			}
		}
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		encoder := json.NewEncoder(w)
		err = encoder.Encode(publicSummaries)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	},
	"GET /playtrees/me": func(w http.ResponseWriter, r *http.Request) {
		spotifyRequest, _ := http.NewRequest("GET", "https://api.spotify.com/v1/me", nil)
		spotifyRequest.Header.Set("Authorization", r.Header.Get("Authorization"))
		client := &http.Client{}
		spotifyResponse, _ := client.Do(spotifyRequest)
		defer spotifyResponse.Body.Close()
		decoder := json.NewDecoder(spotifyResponse.Body)

		type SpotifyUserInfo struct {
			ID string `json:"id"`
		}

		var userInfo SpotifyUserInfo

		decoder.Decode(&userInfo)

		summaries, err := getAllPlaytreeSummaries()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		summariesByUser := []Summary{}
		for _, summary := range summaries {
			if summary.CreatedBy == userInfo.ID {
				summariesByUser = append(summariesByUser, summary)
			}
		}

		encoder := json.NewEncoder(w)
		err = encoder.Encode(summariesByUser)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	},
	"POST /playtrees": func(w http.ResponseWriter, r *http.Request) {
		// validate playtree JSON given in body
		psi, invalidPartialSummaryJsonErr := partialSummaryInfoFromJSON(r.Body)

		if invalidPartialSummaryJsonErr != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, invalidPartialSummaryJsonErr.Error())
			log.Println(invalidPartialSummaryJsonErr)
			return
		}

		// generate ID
		newPlaytreeId := uuid.New().String()

		pti := Playtree{
			Summary: Summary{
				ID:        newPlaytreeId,
				Name:      psi.Name,
				CreatedBy: psi.CreatedBy,
				Access:    psi.Access,
			},
			Playnodes:  make(map[string]Playnode),
			Playroots:  make(map[string]Playhead),
			Playscopes: []Playscope{},
		}

		// create JSON file <id>.json with body contents, return Created
		pathToNewPlaytreeFile := "playtrees/" + newPlaytreeId + ".json"
		file, fileCreateErr := os.Create(pathToNewPlaytreeFile)
		if fileCreateErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, "Could not create playtree file")
			return
		}

		encoder := json.NewEncoder(file)
		encoder.SetIndent("", "\t")

		writeErr := encoder.Encode(pti)
		if writeErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, writeErr)
			return
		}

		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(newPlaytreeId))
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
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		// check if file already exists. if not, 404 error.
		id := r.PathValue("id")
		idDotJson := "./playtrees/" + id + ".json"

		// validate playtree JSON given in body
		pti, invalidPlaytreeJsonErr := playtreeInfoFromJSON(r.Body)

		if invalidPlaytreeJsonErr != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, invalidPlaytreeJsonErr)
			return
		}

		if invalidPlaytreeSemanticErr := validatePlaytreeInfo(pti); invalidPlaytreeSemanticErr != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, invalidPlaytreeSemanticErr)
			return
		}

		file, openErr := os.OpenFile(idDotJson, os.O_WRONLY|os.O_TRUNC, 0644)
		if openErr != nil {
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, `Playtree with ID "`+id+`" does not exist`)
			return
		}
		defer file.Close()

		// write updated playtree to file
		encoder := json.NewEncoder(file)
		encoder.SetIndent("", "\t")

		writeToFileErr := encoder.Encode(pti)
		if writeToFileErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, "Could not update playtree resource")
			log.Println(writeToFileErr)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	},
	"DELETE /playtrees/{id}": func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
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
	"OPTIONS /playtrees/{id}": func(w http.ResponseWriter, r *http.Request) {
		// _ := r.PathValue("id")
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
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
