import { ActionFunctionArgs, redirect } from "@remix-run/node"
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server"

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const response = await serverFetchWithToken(request, `${process.env.PLAYTREE_SERVER_API_PATH}/playtrees/${params.playtree}`, {
		method: "DELETE"
	})

	return redirect("/")
}