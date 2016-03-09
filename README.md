# Getting Started
##### How to see the project
To see what I've build, open the index.html file in a web browser.

Aside from this readme, there is some relevant documentation in the only javascript file.

##### Why I chose to do it this way
If this were a bigger project things would look and work a lot different.  It would be nice to have some sort of module loader, but there are only a few modules.  It would have been nice to use ES6 features but then I'd need a build system, transpiler, etc. There isn't enough code, nor enough places in the code to make those totally necessary.

I thought it was cooler if you could just download the code and see it right away. Change code and see the changes right away, etc.

The CSS is a little bit complex but it isn't out of control. If I had to add any more it would be nice to use Sass as a css pre-compiler.

###### Limitations
My choice of not having a build process, dependencies, etc. made the code messier as it is all in one file. The view rendering is all vanilla JS which isn't as performant as a virtual dom and isn't as developer friendly as a view-binding framework... but there's very little that needs to be rendered anyway.

Since it's a very stripped down project there are other things missing.  One is unit tests.  Normally I'd try to use TDD or at least have unit tests to cover my code.  I decided not to include them.

It also doesn't have certain config files like a linter, editorconfig, etc.  Those things are very useful for bigger projects where multiple people are working on them.

# Browser Support
The oldest browser this weather logger supports is IE 10. I chose this because this is the oldest browser that has full native WebSocket support.  I didn't actually test it in IE10, but theoretically all the styles I used and all the JS I used is supported in IE 10+.

# My Approach
I wanted this thing to look really cool visually and I wanted it to be very easy to run or add to without complex setup.

There are a couple nice transitions and things are setup to look good.  However, not having periodic temperature readings made the timestamps difficult to work with.  I have to display them in their full form which is ugly. The full timestamp problem also caused the chart to be ugly. If the timestamps were periodic then I could fit labels on the chart and the datapoints would be evenly spaced (which is desired for line charts).

# Problems
Aside from implementation changes I already discussed, I'd have added must better error handling, right now it just silently fails and the user would have no idea what's going on.

The UI feels weird once you actually submit data. I'd have taken more time to make it more clear the data was submitted successfully.

I couldn't get the websockets to work across tabs / browsers. I looked through the documentation but didn't see options for the read API to auto-send the latest when it receives new values. I noticed there were subscriptions in other parts of the API but I didn't play with those.

Styling the FAB was a little harder and messier than I'd want it to be. I'd refactor that.

I wrote the CSS in a way to be responsive down to mobile. However, because flexbox is kind of weird there could be
rendering issues resizing from mobile (portrait) to > 600px (landscape).
