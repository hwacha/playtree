import { ActionFunctionArgs } from "@remix-run/node";
import { Form, Fetcher, useFetcher, useLoaderData } from "@remix-run/react"
import invariant from "tiny-invariant";

type SummaryCardProps = {
    summary: PlaytreeSummary;
}

export const loader = async () => {
    const response = await fetch("http://localhost:8080/playtrees")
    return await response.json()
}

export const action = async ({request}: ActionFunctionArgs) => {
    const formData = await request.formData()
    const id = formData.get("playtreeID");
    const response = await fetch(`http://localhost:8080/me/player?playtree=${id}`, {
        method: "PUT"
    })
    return null
}

const SummaryCard = ({summary} : SummaryCardProps) => {
    const fetcher = useFetcher()
    return (
        <div className="h-[192px] w-[192px] inline-grid border-4 bg-lime-100 rounded-xl border-green-600 text-center font-lilitaOne m-6 py-10">
            <h3 className="text-xl text-green-600">{summary.name}</h3>
            <p className="text-green-600">by {summary.createdBy.name}</p>
            <fetcher.Form method="post">
                <input type="hidden" id="playtreeID" name="playtreeID" value={summary.id} />
                <button type="submit" className="border-2 border-green-600 rounded-md px-3 py-2 m-4 bg-green-600 text-white">Play</button>
            </fetcher.Form>
        </div>
    )
}

export default function Index() {
    const playtrees = useLoaderData<typeof loader>()
    const fetcher = useFetcher()
    if (fetcher.state === "loading") {
        fetcher.load("/")
    }
    
    return (<div className="mt-24 m-auto w-fit">{playtrees.map((summary:any) => {
        return <SummaryCard key={summary.id} summary={summary}></SummaryCard>
    })}</div>)
}
