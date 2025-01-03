import { Link } from "@remix-run/react";

type LinkCardProps = {
    title: string;
    description: string;
    action: string;
    path: string;
}

const ActionCard = (props : LinkCardProps) => {
    return (
        <div className="relative border-green-600 bg-green-100 bg-opacity-50 border-2 rounded-lg h-48 w-48 font-lilitaOne text-green-600 p-2 mx-4">
                <h2 className="text-4xl text-center underline">{props.title}</h2>
                <p className="mt-4 ml-2">{props.description}</p>
                <div className="absolute bottom-2 flex items-center w-48 -mx-4">
                    <Link to={props.path} className="mx-auto">
                        <button type="button" className="border-green-600 bg-green-300 border-2 rounded-md px-2 py-1">{props.action}</button>
                    </Link>
                </div>
        </div>
    )
}

export default function Index() {
    return (
        <div className="flex w-full h-full my-40 content-evenly">
            <div className="m-auto flex">
                <ActionCard title="Arboretum" description="A compendium of all public playtrees." action="Check it Out" path="/playtrees" />
                <ActionCard title="Seed" description="A new playtree." action="Create" path="/playtrees/create" />
            </div>
            
        </div>
    )
}