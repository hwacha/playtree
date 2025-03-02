import { FormEventHandler, useEffect, useRef, useState } from "react";
import { SPOTIFY_SEARCH_API_PATH } from "../api_endpoints";
import { clientFetchWithToken } from "../utils/fetch-with-token";

type SearchFieldProps = {
	onContentSelect: (content: SearchResult) => boolean;
	onFocusOut: (event: FocusEvent) => void
}

export type SearchResult = {
	track: string;
	artist: string;
	uri: string | null;
}

export const queryString: ((sr: SearchResult) => string) = sr => {
	if (sr.artist === "") {
		return sr.track
	} else {
		return `${sr.track} - ${sr.artist}`
	}
}

export default function SearchField(props: SearchFieldProps) {
	const [query, setQuery] = useState<SearchResult>({ track: "", artist: "", uri: null })
	const [searchResults, setSearchResults] = useState<SearchResult[]>([])

	const inputRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.addEventListener("focusout", event => {
				props.onFocusOut(event)
			})
		}
	}, [])

	const onSearchQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const newQueryString = event.target.value
		let newQuery: SearchResult = { track: event.target.value, artist: "", uri: null }
		const matchingSearchResult = searchResults.find(sr => queryString(sr) === newQueryString)
		if (matchingSearchResult) {
			newQuery = matchingSearchResult
		}
		setQuery(newQuery)
	}

	const handleSubmit: FormEventHandler<HTMLFormElement> = event => {
		if (query.uri !== null) {
			if (props.onContentSelect(query)) {
				setQuery({ track: "", artist: "", uri: null })
				setSearchResults([])
			}
		}
		event.preventDefault()
		return false
	}



	useEffect(() => {
		if (query.track.length >= 2) {
			(async () => {
				const data = await clientFetchWithToken(SPOTIFY_SEARCH_API_PATH(query.track))
				const dataAsJSON = await data.json()
				const searchResultsJSON: SearchResult[] = dataAsJSON.tracks.items.map((item: any) => { return { track: item.name, artist: item.artists[0].name, uri: item.uri } })
				setSearchResults(searchResultsJSON)
			})()
		} else if (searchResults.length > 0) {
			setSearchResults([])
		}
	}, [query])

	return (
		<form onSubmit={handleSubmit}>
			<input ref={inputRef} autoComplete="off" className="w-40 font-markazi text-black" list="spotify-search-suggestions" id="search-field" name="search-field" value={queryString(query)} placeholder="Search for a song" onChange={onSearchQueryChange} />
			<datalist id="spotify-search-suggestions">
				{
					searchResults.map((searchResult, index) => {
						return <option key={index} value={queryString(searchResult)} />
					})
				}
			</datalist>
		</form>
	)
}