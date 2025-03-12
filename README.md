# Playtree

Playtree is an application that plays audio non-linearly. Instead of playing songs from a playlist sequentially or shuffled, a playtree chooses the next song by randomly choosing one of a song node's children. Playback can loop and branch. Playtrees can have multiple roots, which each form separate playheads a user can switch between.

The playtree server is written using Go. The playtree client is written with Remix/React, with Tailwind for styling. The playtree editor uses the React Flow library, and a web player is created with the Spotify Web Player SDK.

Go to https://playtree.gdn on a desktop or laptop computer to try out playtree. You can visit the arboretum to check out public playtrees other users have made, or you can make one of your own.

To play music from a playtree, you need to sign in to Spotify with a Spotify Premium account.

## What is a playtree?
It's like a playlist, but it allows for random branching. If playlists are a sequential data type, think of a playtree as the graph equivalent: songs are played at playnodes and playback traverses playedges to find the next playnode to play. If there are multiple outgoing playedges, one of the playedges is selected at random. You can set the "shares" on a playedge to weight its likelihood of being chosen: if a playnode finishes playback with two outgoing playedges, A with 1 share and B with 2 shares, it will traverse playedge A with a probability of 1/3 and B with a probability of 2/3.

You can limit the number of times a playedge is traversed. After a playedge reaches its limit, it won't be selected the next time a node is played. Think of it like its shares being taken out of the "play lottery". One from the remaining outgoing playedges is selected. If a playnode doesn't have any outgoing playedges, playback stops, the playhead resets, and playback is transferred to the next playhead.

You can add a "playroot" to any of the playnodes in a playtree, and it will create a playhead starting at the selected playnode. Having multiple playheads lets you change playback within the same playtree at will while you're listening.

Playnodes come in two types: sequencer and selector. You can add a list of Spotify tracks to a playnode; a sequencer plays each in sequence before passing playback to a playedge, while a selector plays one song from the list chosen at random. You can set a "multiplier" value, which repeats a song in a seqeuncer and weights the probability of a song in a selector. You can also set a _playnode_ to repeat, which will repeat all playback of a playnode, and you can limit the plays of a playnode just like a playedge. When a playnode reaches its limit, playback will "pass through" and traverse an outgoing edge without playing any of the playnode's songs. Limiting an individual song in a sequencer playnode is similar to limiting a playnode: playback will pass through that song once it reaches its limit. A song that reaches its limit in a selector node, on the other hand, has its shares removed and won't have a chance to be selected next time.

There's one more parameter on playedges called "priority". Only edges from the lowest priority are elligible for selection. Having edges with multiple priorities combined with limiting the lower priority playedges enables sequential and conditional behavior: give a playedge C a priority of 0 and a limit of 1 and a playedge D a priority of 1. In that case, C will always be chosen first, and D will always be chosen next.

The counters for limiting playnodes, playedges, and songs are global by default, but you can specify "playscopes" to localize limits. Playscopes are regions carved out by sets of playnodes. Playback travelling within a playscope maintains counters for limits residing within; once playback exits a playscope, all counters from playnodes, playedges, and songs that fall within that playscope are reset to 0.

## How can you use a playtree?
I'm not entirely sure! I didn't make playtrees to serve a specific purpose. I did have in mind the dynamic soundtracks found in video games. You can play a video game OST in a way that better reflects how it might be heard in the game: a looping level song can randomly play the "game over" song before playing the main menu song, after which another level song is chosen at random. Maybe video game composers could test out their music in such a setting, or even release a playtree as a supplement to a traditional OST.

I also liked the idea of changing between a few playback sources on your main controller, without having to manually start a new playlist. In this way, having multiple playheads is reminiscent of old car systems that let you put in a few CDs and change between them. Modern streaming platforms typically don't allow for the transfer of playback like that: you have to manually select a new playlist from a menu. I kept thinking back to a friend of mine whose brother drives an old car. For whatever reason, his GPS won't be audible unless it's interrupting music. For peace and quiet on the road, he loops John Cage's 4'33'', which was his most played track on Spotify by a wide margin. I found this pretty amusing, and I liked the idea of switching between 4'3'' and, you know, _actual music_ at the click of a button.

Then, in the course of adding new features to playtree and testing it out, I realized you can make some pretty cool structures. You can play that song you love exactly three times before moving on to the rest of the playlist. Or you can make what I call a "zipper shuffle": you can make two (or three, or four...) playlists, randomly play one song from the first, randomly play the next song from the second, and then play the next song from the first again, until each playlist has gone through all its songs. A couple or a group of friends can each make a playlist and then the zipper shuffle can dole them out equitably.

Or, you can make a "party" playtree that separates the night out into phases, while still allowing for replayability the next weekend: randomly chose 5 from a large pool of karaoke classics, and then move on to play 12 bangers before moving into an infinite loop of ambient comedown tracks. You get structure and randomness working in tandem.

In any case, I made playtree so that people can try out a new way to structure music listening. Maybe an inspired musician could chose the playtree structure instead of an album format for their next project. You should [give it a try](https://playtree.gdn) and chart out something new!
