import { FormEventHandler, useEffect, useMemo, useRef, useState } from "react";
import { SPOTIFY_SEARCH_API_PATH } from "../api_endpoints";
import { clientFetchWithToken } from "../utils/client-fetch-with-token";
import { useSubmit } from "@remix-run/react";

type SearchFieldProps = {
	onContentSelect: (content: SearchResult) => boolean;
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

	const queryMatchesASearchResult = useMemo(() => {
		return searchResults.some(sr => queryString(sr) === queryString(query))
	}, [searchResults, query])

	return (
		<form onSubmit={handleSubmit} className="flex">
			<input
				autoComplete="off"
				className="w-full font-markazi text-black mr-1"
				list="spotify-search-suggestions"
				id="search-field"
				name="search-field"
				value={queryString(query)}
				placeholder="Search for a song"
				onChange={onSearchQueryChange}
			/>
			<datalist id="spotify-search-suggestions">
				{
					searchResults.map((searchResult, index) => {
						const qs = queryString(searchResult)
						return <option key={index} title={qs} value={qs} />
					})
				}
			</datalist>
			<button
				type="submit"

				className={`rounded-lg px-2 ${queryMatchesASearchResult ? `bg-blue-200 text-blue-600` : "bg-neutral-300 text-neutral-500"} font-markazi ${queryMatchesASearchResult ? "" : "hover:cursor-not-allowed"}`}
				disabled={!queryMatchesASearchResult}
			>Add</button>
		</form>
	)
}