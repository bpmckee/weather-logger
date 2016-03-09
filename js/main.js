/* I'm wrapping my different code modules in an IIFE to pollute the global
 * namespace as little as possible. Additionally, since I'm not using a build
 * process or module loader, these could represent individual modules.
 */

// my app's namespace
var myApp = {};

// ============================ SOCKET MODULE ============================
/**
 * The main purpose of the socket module is to make it easy to interact
 * with the websocket including setup, message subscription, as well as
 * sending requests.
 *
 * The way this module is written is sort of a handful until you understand
 * what is going on.
 *
 * ---- constructor ----
 * This IIFE returns a constructor
 * The constructor would be written in a way to provide config settings to the
 * websocket. I show an example of this by making cik customizable.
 * The function provides utility methods and properties:
 *		- init(): creates & authenticates the websocket & websocket evt handlers
 *		- build(): starts a websocket request builder (more on that below)
 *		- subscribe(): a way for other services to be alerted to filterd socket messages
 *		- socket: a reference to the actual websocket
 *		- cik: the cik the websocket used to authenticate
 *
 * ---- init(callback) ----
 * When you have a new instance of the MySocket function, call the '.init'
 * prototype method passing a callback function for when the initialization is
 * complete.
 * The initialization process includes creating the actual websocket and any
 * necessary websocket event handlers.  It also sends an authentication request.
 *
 * ---- subscribe(callback) ----
 * Websockets only have one assignable onmessage function. Multiple places in
 * the code may want to react to certain websocket messages. For this reason I
 * decided to implement a very stripped down pub/sub for the websocket.
 *
 * If you want to subscribe to the websocket's messages you must pass the
 * message handler into the subscribe prototype method as a callback.
 *
 * Note that the actual websocket events are not returned, and not all events
 * will broadcast to the subscriptions.  Errors, authentication events, and
 * unknown websocket events will not be broadcasted. When an event does get
 * broadcasted, the only data the subsubscribers see are the invidiaul
 * result properties on the data object.
 *
 * ---- Socket request builder ----
 * The websocket request builder was a (poor) attempt at reusable and configurable
 * websocket requests. I also wanted to make it easy to send multiple calls
 * in the same request. Since I'm only really making two requests, a read latest
 * and a write, there isn't a whole lot of configuration or use for something
 * this complex.  However, it wouldn't be too hard to extend the request builder
 * to cover the full API and be fully customizable. The dev would just have to
 * copy the pattern I've already started.
 *
 * To use the request builder and actually send a request, you must start
 * with the MySocket object, and call the .build() method. This starts the
 * request builder chain. When you are finished, you must call the .send()
 * method which ends the builder chain and sends your request(s).

 * e.g. mySocket.build().writeTemp(65).andThen.readLatest(5).send()
 * ^^^ this builds a request to do two calls, a write with a value of 65,
 * and a read which gets the latest 5 temperatures.
 *
 * The API I have right now is very specific to writing temperatures and
 * reading only the latest temperatures which isn't good.
 *
 * - writeTemp(temperature)
 * 		builds a 'write' call for a temperature provided as the first argument
 * - readLatest(optionalNumLatest)
 *		builds a 'read' call to return the latest x number of temperatures
 *		the first argument specifies the number of temps to fetch which if
 * 		not provided will default to 5.
 * - andThen
 *		I included this property for a couple of reasons.  One, it makes the
 *		chain more human readable. Two, normally chain APIs like this one
 *		are written differently to allow for multiple customizations to one call
 *		before starting another.
 *		e.g. mySocket.build().read.latest(5).temperatures.andThen.write.temperature(65).send();
 * - send()
 *		End your chain with the .send() call to compile all the calls that were
 *		built and bundle them all into one websocket send.
 */
myApp.MySocket = (function() {
	'use strict';

	var _defaultCik = '629921c1b981291ecab0e14922eedb5044b098ca';

	// Constructor for the socket request builder
	// a new instance will be created every time .build() is called
	function SocketRequestBuilder(socket) {
		// keep a reference to the websocket to do the actual send at the end
		this._socket = socket;

		this._calls = [];
		Object.defineProperties(this, {
			andThen: {
				value: this,
				enumerable: true
			}
		});
		Object.freeze(this);
	}

	// Builds a call the websocket can use to write a new temperature
	SocketRequestBuilder.prototype.writeTemp = function(value) {
		this._calls.push({
			id: 1,
			procedure: 'write',
			arguments: [
				{ alias: 'temperature' },
				value + ''
			]
		});
		return this;
	};

	// Builds a call teh websocket can use to read the latest x temp values
	SocketRequestBuilder.prototype.readLatest = function(limit) {
		this._calls.push({
			id: 1,
			procedure: 'read',
			arguments: [
				{ alias: 'temperature' },
				{ limit: limit || 5 }
			]
		});
		return this;
	};

	// Ends the chain and sends off the calls that were made (if any)
	SocketRequestBuilder.prototype.send = function() {
		this._socket.socket.send(JSON.stringify({
			// auth: { cik: this._socket.cik },
			calls: this._calls
		}));
	};

	// If I had more time I'd implement a much better error handling system
	function handleSocketError(event) {
		console.error('Socket error', event);
	}

	// Actual constructor for the module.
	// I setup an example of how you can provide custom options as arguments
	function MySocket(cik) {
		var _cik = cik || _defaultCik;
		Object.defineProperties(this, {
			cik: {
				value: _cik,
				enumerable: true
			},
			socket: {
				// a new websocket will be created & stored here on init
				value: undefined,
				enumerable: true,
				writable: true
			},
			_subscriptions: {
				value: []
			}
		});
		Object.seal(this);
	}

	// This messy init function builds the actual websocket and related handlers.
	// When it's ready, it then sends an authentication request.
	// After it's fully authenticated, it responds with a callback.
	// If I wanted to do this a better way I'd probably use promises or at a
	// minimum, provide some way to pass errors to the caller.
	MySocket.prototype.init = function(callback) {
		var self = this;
		var socket = new WebSocket("wss://m2.exosite.com/ws");
		self.socket = socket;
		socket.onerror = handleSocketError;
		socket.onmessage = function(event) {
			var response = JSON.parse(event.data);
			// Transform the response if necessary so we can handle it all the same way
			if (!Array.isArray(response)) response = [response];

			// Go through the parts of the event we actually care about...
			// determine the type of response we received and how to handle it.
			response.forEach(function(res) {
				if (res.error || !res.status || res.status !== 'ok') {
					return handleSocketError(event);
				}
				if (res.result) {
					// We got important data from the server, tell our subscribers
					self._subscriptions.forEach(function(subscription) {
						subscription(res.result);
					});
				} else {
					// Finished authenticating
					callback();
				}
			});
		};
		socket.onopen = function() {
			self.socket.send(JSON.stringify({
				auth: { cik: self.cik },
			}));
		};
	};

	// Start a socket request builder
	MySocket.prototype.build = function() {
		return new SocketRequestBuilder(this);;
	};

	// Let other pieces of the code know when important websocket messages come
	MySocket.prototype.subscribe = function(callback) {
		this._subscriptions.push(callback);
	};

	return MySocket;

})();

// ============================ DATA MODULE ============================
/**
 * The data module is responsible for storing websocket data, as well as
 * handling different types of websocket broadcasts.
 *
 * Admittedly, this module isn't super useful since services can just
 * subscribe to the websocket directly. However, this was meant to be an
 * abstraction from the websocket so other areas could subscribe to specific
 * types of messages only. However, that case never came up when building this
 * system so this module seems more and more useless.
 */
myApp.data = (function() {
	'use strict';
	var _subscriptions = [];
	var _cachedData = [];

	// Return a copy of the data so no outside code can screw up the cacheData
	// for everybody else.
	function getLatest() {
		return _cachedData.slice();
	}

	// Instead of storing the raw data, I'm storing the sligtly transformed
	// data that other areas of the code are concerned about. That would be
	// having actual dates to work with.
	// One peculiar thing i that the timestamps returned seemed to be off
	// by a factor of 1000.
	function cacheData(rawData) {
		_cachedData = rawData.map(function(data) {
			return [ new Date(data[0] * 1000), data[1] ];
		});
	}

	// Broadcast the transformed data to all subscribers
	function notifySubscribers() {
		_subscriptions.forEach(function(subscription) {
			subscription(getLatest());
		});
	}

	// For my implementation, all the subscribers really cared about was
	// when new data was read. That's why the following method is written the
	// way it is and why this subscription seems like a straight pass-through.
	function handleMessage(result) {
		if (typeof result === 'number') {
			// A number was written and returned, however we don't need to
			// do anything because we also already fetched the newest data
		} else if (Array.isArray(result)) {
			cacheData(result);
			notifySubscribers();
		} else {
			throw new Error('Unknown type of websocket result');
		}
	}

	// expose public API
	return {
		handleMessage: handleMessage,
		subscribe: function(callback) {
			_subscriptions.push(callback);
		},
		logTemperature: function(newValue) {
			myApp.socket.build().writeTemp(newValue).andThen.readLatest(5).send();
		},
		getLatest: getLatest,
		// A utility method for verifying whether or not something is a valid temperature
		// to be a valid temperature I'm assuming -75 to 160 degrees
		// If I wanted production ready code I wouldn't use magic numbers in this fn.
		isValidTemperature: function(value) {
			var numericVal = parseFloat(value);
			return !isNaN(numericVal) && isFinite(numericVal) && numericVal >= -75 && numericVal <= 160;
		}
	};
 })();


// ============================ CHART MODULE ============================
/*
 * This chart module will render the last five weather readings.
 * Admittedly, the chart does not look good.  There are a couple reasons for
 * this.  One, the weather readings are unpredictable so it's hard to add labels
 * and values without being sure they don't overlap each-other.  It also makes
 * the labels very long because I have to include the date down to the minute.
 * This is also why the timestamps look so ugly.
 */
myApp.chart = (function() {
	'use strict';

	// hold static properties
	var chart = {
		element: document.getElementById('weather-chart'),
		settings: {
			legend: 'none',
			vAxis: {
				baselineColor: 'transparent',
				gridlineColor: 'transparent',
				textPosition: 'none'
			},
			chartArea: {
				width: '90%',
				height: '100%'
			}
		}
	};

	// render the chart
	function drawChart() {
		var data = new google.visualization.DataTable();
		data.addColumn('date', 'Date');
		data.addColumn('number', 'Value');

		data.addRows(myApp.data.getLatest());

		var lineChart = new google.visualization.LineChart(chart.element);
		lineChart.draw(data, chart.settings);
	}

	// initialize the chart
	google.charts.load('current', {'packages':['corechart']});
	google.charts.setOnLoadCallback(drawChart);

	// make chart responsive
	window.onresize = drawChart;

	// expose a public API
	return {
		draw: drawChart
	};
})();

// ============================ VIEW RENDERING ============================
/**
 * I decided not to pull in a view rendering library. That likely would have
 * caused me to have a build process. More importantly, it almost certainly
 * would have required 3rd party code that's much longer than the code in this
 * entire document just to render very simple DOM elements.
 *
 * However, not using a good view library does tightly couple the JS code
 * with the HTML so that's the tradeoff.
 */
myApp.view = (function() {

	// setup event handlers for temperature input, store references to the
	// dom elements for performance
	var fab = document.getElementById('fab');
	var fabToggle = document.getElementById('fabToggle');
	var temperatureInput = document.getElementById('temperatureInput');
	var submitBtn = document.getElementById('temperatureInputButton');
	// When a user clicks the floating action button, expand or collapse it.
	fabToggle.onclick = function(event) {
		fab.classList.toggle('expanded');
		temperatureInput.value = undefined;
		submitBtn.disabled = !myApp.data.isValidTemperature(temperatureInput.value);
	};
	// When the user wants to submit a new temperature.
	// First make sure it's a valid temperature, then send the request and
	// close the input area.
	submitBtn.onclick = function(event) {
		if (myApp.data.isValidTemperature(temperatureInput.value)) {
			fab.classList.remove('expanded');
			myApp.data.logTemperature(parseFloat(temperatureInput.value));
		}
	};
	// Anytime new data is added into the input, enable or disable the
	// submit button depending on if the input they entered is valid.
	temperatureInput.oninput = function(event) {
		submitBtn.disabled = !myApp.data.isValidTemperature(temperatureInput.value);
	};

	// ---- private utility methods to help view rendering ----
	function formatDateString(date) {
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
	}

	// Round to the nearest tenth of a degree
	function roundToDecimal(value, numDecimals) {
		var scalar = Math.max(1, numDecimals * 10);
		return Math.round(parseFloat(value) * scalar) / scalar;
	}

	function createLatestWeatherNodes(data) {
		var timestamp = document.createElement('span');
		var temperature = document.createElement('span');

		timestamp.classList.add('weather-latest-time');
		temperature.classList.add('weather-latest-value');

		timestamp.innerHTML = formatDateString(data[0]);
		temperature.innerHTML = roundToDecimal(data[1], 0);
		return [timestamp, temperature];
	}

	function createWeatherListItem(data) {
		var item = document.createElement('li');
		var timestamp = document.createElement('span');
		var temperature = document.createElement('span');

		item.classList.add('weather-recent-list-item');
		timestamp.innerHTML = formatDateString(data[0]);
		temperature.innerHTML = roundToDecimal(data[1], 1) + '&deg;'

		item.appendChild(timestamp);
		item.appendChild(temperature);
		return item;
	}

	// setup the view rendering DOM elements
	var weatherListEl = document.getElementById('weather-recent-list');
	var weatherLatestEl = document.getElementById('weather-latest');

	// Actually render the given the temperature data
	function render(data) {
		weatherListEl.innerHTML = null;
		weatherLatestEl.innerHTML = null;
		var domElements = data.map(function(point, index) {
			if (index === 0) {
				var latestWeatherNodes = createLatestWeatherNodes(point);
				weatherLatestEl.appendChild(latestWeatherNodes[0]);
				weatherLatestEl.appendChild(latestWeatherNodes[1]);
			} else {
				weatherListEl.appendChild(createWeatherListItem(point));
			}
		});
	}

	// Expose a public API
	return {
		render: render
	};
})();

// ============================ initialization ============================
/**
 * This would be the main entry point of the code. It initializes/authenticates
 * the websocket, initializes the rest of the services, and then requests
 * the most recnet data to display.
 */
(function() {
	'use strict';

	var socket = new myApp.MySocket();
	socket.init(function(){
		socket.subscribe(myApp.data.handleMessage);
		myApp.data.subscribe(myApp.chart.draw);
		myApp.data.subscribe(myApp.view.render);
		myApp.socket = socket;
		myApp.socket.build().readLatest(5).send();
	});
})();
