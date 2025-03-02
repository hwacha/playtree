package main

// validates an otherwise syntactically
// well-formed playtreeinfo struct for
// semantic invariants
func validatePlaytreeInfo(pni *Playtree) error {
	// no duplicate node IDs

	// playnode ID field matches map key

	// all target node IDs exist

	// a playnode has at most one playroot

	// all N playroots use every index [0, N)

	// no duplicate playroot index

	// scopes abide by scope rules

	return nil // TODO
}
