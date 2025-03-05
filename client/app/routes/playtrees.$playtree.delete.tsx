import { ActionFunctionArgs, redirect } from "@remix-run/node"
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server"
import { PLAYTREE_SERVER_PLAYTREES_PATH } from "../settings/api_endpoints"

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const response = await serverFetchWithToken(request, `${PLAYTREE_SERVER_PLAYTREES_PATH}/${params.playtree}`, {
		method: "DELETE"
	})

	return redirect("/")
}