import { Link } from "@remix-run/react";

export default function Banner() {
    return (
        <div className="bg-green-600 fixed w-full h-16 p-3 left-48 top-0">
            <Link to="/"><h1 className='font-lilitaOne text-white text-4xl underline'>Playtree</h1></Link>
        </div>
    )
}