package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/lithammer/shortuuid/v4"
)

var currentlyPlaying map[string]*string = make(map[string]*string)

func getSpotifyCurrentUserID(w http.ResponseWriter, r *http.Request) (*string, error) {
	spotifyRequest, _ := http.NewRequest("GET", "https://api.spotify.com/v1/me", nil)
	spotifyRequest.Header.Set("Authorization", r.Header.Get("Authorization"))
	client := &http.Client{}
	spotifyResponse, spotifyErr := client.Do(spotifyRequest)
	if spotifyErr != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return nil, spotifyErr
	}
	if spotifyResponse.StatusCode != 200 {
		w.WriteHeader(spotifyResponse.StatusCode)
		return nil, errors.New("spotify error")
	}

	defer spotifyResponse.Body.Close()
	decoder := json.NewDecoder(spotifyResponse.Body)

	type SpotifyUserInfo struct {
		ID string `json:"id"`
	}

	var userInfo SpotifyUserInfo
	decoder.Decode(&userInfo)

	return &userInfo.ID, nil
}

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

func setAllowOriginHeader(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")

	if origin == "http://localhost:5173" || origin == "http://localhost:3000" || origin == "https://playtree.gdn" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	} else {
		w.Header().Set("Access-Control-Allow-Origin", "https://playtree.gdn")
	}
}

var handlers = map[string]func(http.ResponseWriter, *http.Request){
	"GET /playtrees": func(w http.ResponseWriter, r *http.Request) {
		summaries, err := getAllPlaytreeSummaries()
		publicSummaries := []Summary{}

		startIndexString := r.URL.Query().Get("start")
		startIndex, numberConversionErr := strconv.Atoi(startIndexString)
		if numberConversionErr != nil || startIndex < 0 {
			startIndex = 0
		}
		counter := 0
		for i := startIndex; i < len(summaries); i++ {
			summary := summaries[i]
			if summary.Access == "public" {
				publicSummaries = append(publicSummaries, summary)
				counter++
				if counter == 60 {
					break
				}
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
		currentUserID, spotifyErr := getSpotifyCurrentUserID(w, r)
		if spotifyErr != nil {
			return
		}

		summaries, err := getAllPlaytreeSummaries()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		summariesByUser := []Summary{}
		for _, summary := range summaries {
			if summary.CreatedBy == *currentUserID {
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
		newPlaytreeId := shortuuid.New()

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
		setAllowOriginHeader(w, r)

		// validate that the client has a valid access token
		// and that the user is the creator of the playtree
		currentUserID, spotifyErr := getSpotifyCurrentUserID(w, r)
		if spotifyErr != nil {
			return
		}

		id := r.PathValue("id")
		playtreeFilename := "./playtrees/" + id + ".json"

		playtreeFile, openErr := os.Open(playtreeFilename)
		if openErr != nil {
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, `Playtree with ID "`+id+`" does not exist`)
			return
		}
		defer playtreeFile.Close()

		playtree, _ := playtreeInfoFromJSON(playtreeFile)
		if playtree.Summary.CreatedBy != *currentUserID {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		encoder := json.NewEncoder(w)
		writeErr := encoder.Encode(playtree)

		if writeErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	},
	"PUT /playtrees/{id}": func(w http.ResponseWriter, r *http.Request) {
		setAllowOriginHeader(w, r)

		// check if file already exists. if not, 404 error.
		id := r.PathValue("id")
		idDotJson := "./playtrees/" + id + ".json"

		// validate playtree JSON given in body
		pti, invalidPlaytreeJsonErr := playtreeInfoFromJSON(r.Body)

		currentUserID, spotifyErr := getSpotifyCurrentUserID(w, r)
		if spotifyErr != nil {
			return
		}

		if invalidPlaytreeJsonErr != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, invalidPlaytreeJsonErr)
			return
		}

		if pti.Summary.CreatedBy != *currentUserID {
			w.WriteHeader(http.StatusForbidden)
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
		setAllowOriginHeader(w, r)

		currentUserID, spotifyErr := getSpotifyCurrentUserID(w, r)
		if spotifyErr != nil {
			return
		}
		id := r.PathValue("id")
		filename := "./playtrees/" + id + ".json"
		data, readErr := os.ReadFile(filename)

		if readErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		var playtree Playtree
		jsonErr := json.Unmarshal(data, &playtree)
		if jsonErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		if playtree.Summary.CreatedBy != *currentUserID {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		err := os.Remove(filename)
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
		setAllowOriginHeader(w, r)
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	},
	"GET /me/player": func(w http.ResponseWriter, r *http.Request) {
		currentUserID, spotifyError := getSpotifyCurrentUserID(w, r)
		if spotifyError != nil {
			return
		}

		if currentlyPlaying[*currentUserID] == nil {
			fmt.Fprint(w, "null")
			return
		}

		data, readErr := os.ReadFile("./playtrees/" + *currentlyPlaying[*currentUserID] + ".json")
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

		currentUserID, spotifyErr := getSpotifyCurrentUserID(w, r)
		if spotifyErr != nil {
			return
		}

		file, readErr := os.ReadFile("./playtrees/" + id + ".json")

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
		var pt Playtree
		jsonErr := json.Unmarshal(file, &pt)
		if jsonErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, jsonErr.Error())
			return
		}

		if pt.Summary.Access == "public" || pt.Summary.CreatedBy == *currentUserID {
			currentlyPlaying[*currentUserID] = &id
			w.WriteHeader(http.StatusNoContent)
		} else {
			w.WriteHeader(http.StatusForbidden)
		}
	},
}

func runServer() {
	for route, handler := range handlers {
		http.HandleFunc(route, handler)
	}
	fmt.Println("Server listening on http://localhost:8080/")
	http.ListenAndServe(":8080", nil)
}
