import { Form, useLoaderData } from "@remix-run/react"

type SummaryCardProps = {
    summary: PlaytreeSummary;
}

export const loader = async () => {
    const response = await fetch("http://localhost:8080/playtrees")
    return await response.json()
}

const SummaryCard = ({summary} : SummaryCardProps) => {
    return (
        <div className="h-[288px] w-[288px] inline-grid border-4 bg-lime-100 rounded-xl border-green-600 text-center mx-6 py-24">
            <h3 className="text-xl text-green-600">{summary.name}</h3>
            <p className="text-green-600">by {summary.createdBy.name}</p>
            <Form action={`/player/play/${summary.id}`} method="put" >
            <button type="submit">▶️</button>
            </Form>
        </div>
    )
}

export default function Index() {
    const playtrees = useLoaderData<typeof loader>()
    return (<div className="mt-24 m-auto w-fit">{playtrees.map((summary:any) => {
        return <SummaryCard key={summary.id} summary={summary}></SummaryCard>
    })}</div>)
}
