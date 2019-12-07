/* -------------------------------------------------------------------------- */
/* File: app.js                                                               */
/* App: SugarWatch                                                            */
/* Author: David Leclerc                                                      */
/* Date: 30.11.2019                                                           */
/* Version: 1.0.0                                                             */
/* -------------------------------------------------------------------------- */

// CONSTANTS
// Time
const TIME_3_H = 3 * 60 * 60;    // [s]
const TIME_6_H = 2 * TIME_3_H;   // [s]
const TIME_12_H = 2 * TIME_6_H;  // [s]
const TIME_24_H = 2 * TIME_12_H; // [s]
const TIME_REFRESH_RATE = 60;    // [s]

// BGs
const BG_UNITS = "mmol/L";
const BG_NONE = "---";
const BG_MAX_AGE = 15 * 60;       // [s]
const BG_DELTA_MAX_AGE = 15 * 60; // [s]
const BG_REFRESH_RATE = 5 * 60;   // [s]

// Graph
const GRAPH_BG_MAX = 16;           // [mmol/L]
const GRAPH_BG_LOW = 3.8;          // [mmol/L]
const GRAPH_BG_HIGH = 8.0;         // [mmol/L]
const GRAPH_PADDING_RIGHT = 50;    // [px]
const GRAPH_TIME_AXIS_HEIGHT = 20; // [px]

// Colors
const COLOR_BG_HIGH = "#ff9d2f";
const COLOR_BG_LOW = "#e50000";
const COLOR_BG_NORMAL = "#999999";

// Download requests
const BG_REQUEST_URL = "https://dleclerc.net/sugarscout/reports/BG.json";
const BG_REQUEST_HEADERS = {
	"Cache-Control": "no-cache",
	"Pragma": "no-cache",
};


// GENERATORS
function * getTimescales() {
	while (true) {
		yield TIME_3_H;
		yield TIME_6_H;
		yield TIME_12_H;
		yield TIME_24_H;
	}	
}
const timescales = getTimescales();


// STATE
const state = {
	time: {
		now: { date: null, epoch: 0 },
		lastUpload: { date: null, epoch: 0 },
	},
	graph: {
		bgs: [],
		scales: {
			time: timescales.next().value,
			bg: GRAPH_BG_MAX,
		},
	},
};


// DOM
const dom = {
	dash: {
		self: document.querySelector("#dash"),
		time: document.querySelector("#dash-time"),
		bg: document.querySelector("#dash-bg-value"),
		delta: document.querySelector("#dash-bg-delta"),
	},
	graph: {
		self: document.querySelector("#graph"),
		bgs: document.querySelectorAll(".graph-bg"),
		axes: {
			time: {
				self: document.querySelector("#graph-axis-time"),
				ticks: document.querySelectorAll(".graph-axis-time-tick"),
				labels: document.querySelectorAll(".graph-axis-time-label"),
				now: document.querySelector("#graph-axis-time-now"),
			},
		},
		targets: {
			low: document.querySelector("#graph-bg-target-low"),
			high: document.querySelector("#graph-bg-target-high"),
		},
	},
};


// UI
const graphSize = dom.graph.self.getBoundingClientRect();
const ui = {
	graph: {
		width: graphSize.width - GRAPH_PADDING_RIGHT,
		height: graphSize.height - GRAPH_TIME_AXIS_HEIGHT,
	},
};




/* -------------------------------------------------------------------------- */
/* TIME FUNCTIONS                                                             */
/* -------------------------------------------------------------------------- */

/**
 * GETEPOCHTIME
 * Get epoch time in seconds from a date object
 */
const getEpochTime = (t) => {
	return t.getTime() / 1000;
};


/**
 * PARSETIME
 * Parse string time into date object, using format: YYYY.MM.DD - HH:MM:SS
 */
const parseTime = (t) => {
	const [ date, time ] = t.split(" - ");
	const [ year, month, day ] = date.split(".");
	const [ hour, minute, second ] = time.split(":");

	return new Date(year, month - 1, day, hour, minute, second, 0);
};


/**
 * GETLASTROUNDHOUR
 * Get last round hour as date object using current time
 */
const getLastRoundHour = (t) => {
	return new Date(Math.floor(getEpochTime(t) / 3600) * 3600 * 1000);
};


/**
 * SETCURRENTTIME
 * Update current time
 */
const setCurrentTime = (t) => {
	state.time.now = { date: t, epoch: getEpochTime(t) };
};


/**
 * SETLASTUPLOADTIME
 * Update last time BG JSON file was modified (uploaded on server)
 */
const setLastUploadTime = (t) => {
	state.time.lastUpload = { date: t, epoch: getEpochTime(t) };
};




/* -------------------------------------------------------------------------- */
/* FORMAT FUNCTIONS                                                           */
/* -------------------------------------------------------------------------- */

/**
 * FORMATTIME
 * Add a zero to a number that"s less than 10 for time displaying purposes
 */
const formatTime = (t) => {
	return t < 10 ? "0" + t : t;
};


/**
 * FORMATBG
 * Add a zero after the comma if the BG is an integer
 */
const formatBG = (bg) => {
	const roundedBGx10 = Math.round(bg * 10);
	const isInteger = roundedBGx10 % 10 === 0;
	const roundedBG = roundedBGx10 / 10;

	return isInteger ? roundedBG + ".0" : roundedBG;
};


/**
 * FORMATDELTABG
 * Force symbol in front of number representation a delta BG
 */
const formatDeltaBG = (dBG) => {
	const formattedDelta = formatBG(dBG);

	return dBG >= 0 ? "+" + formattedDelta : formattedDelta;
};




/* -------------------------------------------------------------------------- */
/* MISC FUNCTIONS                                                             */
/* -------------------------------------------------------------------------- */

/**
 * COMPAREBGSTIME
 * Compare BGs based on their time 
 */
const compareBGsTime = (bg1, bg2) => {
	if (bg1.t < bg2.t) {
		return -1;
	} else if (bg1.t > bg2.t) {
		return 1;
	} else {
		return 0;
	}
};


/**
 * COMPAREBGSVALUE
 * Compare BGs based on their value 
 */
const compareBGsValue = (bg1, bg2) => {
	if (bg1.value < bg2.value) {
		return -1;
	} else if (bg1.value > bg2.value) {
		return 1;
	} else {
		return 0;
	}
};




/* -------------------------------------------------------------------------- */
/* DOWNLOAD FUNCTIONS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * FETCH
 * Returns a promise that resolves to the parsed content of the file retrieved
 * from the given URL, using an HTTP GET request.
 */
const fetch = (url, headers = {}, method = "GET", async = true) => {
	return new Promise((resolve, reject) => {
		console.log(`Fetching data at: ${url}`);
		const request = new XMLHttpRequest();

		// Success callback
		const onsuccess = () => {
			console.log("Fetched data successfully.");
			resolve({
				headers: request.getAllResponseHeaders(),
				content: request.response,
			});
		};

		// Fail callback
		const onfail = (err) => {
			console.error("Could not fetch data.");
			reject(err);
		}

		// Event listeners
		request.onload = onsuccess;
		request.onabort = onfail;
		request.onerror = onfail;
		request.ontimeout = onfail;

		// Open request
		request.open(method, url, async);

		// Set its HTTP headers
		for (const [ property, value ] of Object.entries(headers)) {
			request.setRequestHeader(property, value);
		}

		// Execute it
		request.send();
	});
};


/**
 * JSONIZERESPONSEHEADERS
 * Convert HTTP request bytestring response headers to an object
 */
const jsonizeResponseHeaders = (str) => {

	// Convert the header string into an array of individual headers
    const headers = str.trim().split(/[\r\n]+/);

    // Create a map of header names to values
    return headers.reduce((result, line) => {
		const parts = line.split(': ');
		const header = parts.shift();
		const value = parts.join(': ');
		
		result[header] = value;

		return result;
    }, {});
};


/**
 * LOADBGS
 * Load BGs with maximum given age from JSON object into app state
 */
const loadBGs = (json) => {
	const { time: { now } } = state;
	console.log("Loading BG data into app state...");
				
	// Get BG times from JSON
	const times = Object.keys(json);

	// Make BG objects with epoch time, and keep only the last 24 hours
	const bgs = times.map((t) => {
		return { t: getEpochTime(parseTime(t)), bg: json[t] };
	}).filter((bg) => {
		return bg.t >= now.epoch - TIME_24_H;
	});
	
	// Sort them timely
	bgs.sort(compareBGsTime);
	
	// Store them (as well as new BG scale if necessary) in app state
	state.graph.bgs = bgs;
	state.graph.scales.bg = Math.max(GRAPH_BG_MAX, ...bgs.map((bg) => { return bg.bg; }));
	console.log("BG data loaded.");
};


/**
 * GETBGS
 * Fetch recent BGs from server and inject them into app state
 */
const getBGs = () => {
	return fetch(BG_REQUEST_URL, BG_REQUEST_HEADERS)
		.then((response) => {
			let { headers, content } = response;

			// Parse request response content and headers
			headers = jsonizeResponseHeaders(headers);
			content = JSON.parse(content);

			// Update last BG upload time in state
			setLastUploadTime(new Date(headers["Last-Modified"]));

			// Load BGs into app state
			loadBGs(content);
		})
		.catch((err) => {
			console.error("Could not fetch BGs.");
		});
};




/* -------------------------------------------------------------------------- */
/* DRAWING/UI FUNCTIONS                                                       */
/* -------------------------------------------------------------------------- */

/**
 * SHOW
 * Show DOM element
 */
const show = (el) => {
	el.style.display = "block";
};


/**
 * HIDE
 * Hide DOM element
 */
const hide = (el) => {
	el.style.display = "none";
};


/**
 * GETBGCOLOR
 * Get color corresponding to given BG value
 */
const getBGColor = (bg) => {
	if (bg >= GRAPH_BG_HIGH) {
		return COLOR_BG_HIGH;
	} else if (bg <= GRAPH_BG_LOW) {
		return COLOR_BG_LOW;
	} else {
		return COLOR_BG_NORMAL;
	}
};


/**
 * GETBGRADIUS
 * Get radius for circle element representing BG in graph based on given
 * timescale
 */
const getBGRadius = (timescale) => {
	switch (timescale) {
		case TIME_3_H:
			return 3;
		case TIME_6_H:
			return 2.5;
		case TIME_12_H:
			return 2;
		case TIME_24_H:
			return 1.5;
	}
}


/**
 * GETTIMEAXISHOURS
 * Get time axis hours based on given timescale
 */
const getTimeAxisHours = (timescale) => {
	switch (timescale) {
		case TIME_3_H:
			return [-2, -1, 0];
		case TIME_6_H:
			return [-4, -2, 0];
		case TIME_12_H:
			return [-8, -4, 0];
		case TIME_24_H:
			return [-16, -8, 0];
	}
}


/**
 * DRAWDASHTIME
 * Draw state time in dash
 */
const drawDashTime = () => {
	const { now } = state.time;
	const hour = formatTime(now.date.getHours());
	const minute = formatTime(now.date.getMinutes());

	dom.dash.time.innerHTML = `${hour}:${minute}`;
};


/**
 * DRAWDASHBG
 * Draw current BG and recent delta in dash
 */
const drawDashBG = () => {
	const { time: { now }, graph: { bgs } } = state;
	let last = undefined;
	let bg = undefined;

	// Get last BGs
	if (bgs.length >= 2) {
		[ last, bg ] = bgs.slice(-2);
		
	} else if (bgs.length === 1) {
		[ bg ] = bgs.slice(-1);
	}

	// Last BG and dBG
	const isOld = bg !== undefined ? bg.t < now.epoch - BG_MAX_AGE : true;
	const isDeltaValid = last !== undefined ? bg.t - last.t < BG_DELTA_MAX_AGE : false;

	// Update current BG and style it accordingly
	if (bg !== undefined) {
		dom.dash.bg.innerHTML = formatBG(bg.bg);
		dom.dash.bg.style.color = getBGColor(bg.bg);
		dom.dash.bg.style.textDecoration = isOld ? "line-through" : "none";

	} else {
		dom.dash.bg.innerHTML = BG_NONE;
	}

	// Update latest BG delta and style it as well
	if (isDeltaValid) {
		dom.dash.delta.innerHTML = `(${formatDeltaBG(bg.bg - last.bg)})`;
		dom.dash.delta.style.color = getBGColor(bg.bg);
		dom.dash.delta.style.textDecoration = isOld ? "line-through" : "none";

		show(dom.dash.delta);

	} else {
		hide(dom.dash.delta);
	}
};


/**
 * DRAWGRAPHBGS
 * Draw BGs in graph
 */
const drawGraphBGs = () => {
	const { time: { now }, graph: { bgs, scales } } = state;

	// Get initial time in graph
	const then = now.epoch - scales.time;

	// Get BG element radius based on current timescale
	const r = getBGRadius(scales.time);

	// Draw each BG element (there are 288 in SVG,
	// corresponding to 24h worth of data)
	dom.graph.bgs.forEach((el, i) => {

		// No BG to draw
		if (i >= bgs.length) {
			hide(el);
			return;
		}

		// Get current BG to draw
		const bg = bgs[i];

		// Compute its position in graph
		const x = (bg.t - then) / scales.time * ui.graph.width;
		const y = (scales.bg - bg.bg) / scales.bg * ui.graph.height;

		// Draw it
		el.setAttribute("r", r);
		el.setAttribute("cx", x);
		el.setAttribute("cy", y);

		// Color it according to its BG value
		el.style.fill = getBGColor(bg.bg);

		// Show it
		show(el);
	});
};


/**
 * DRAWGRAPHTIMEAXISNOW
 * Draw current time tick (line) in graph
 */
const drawGraphTimeAxisNow = () => {
	dom.graph.axes.time.now.setAttribute("x1", ui.graph.width);
	dom.graph.axes.time.now.setAttribute("y1", "0%");
	dom.graph.axes.time.now.setAttribute("x2", ui.graph.width);
	dom.graph.axes.time.now.setAttribute("y2", "100%");
};


/**
 * DRAWGRAPHTIMEAXIS
 * Draw time axis according to current state time
 */
const drawGraphTimeAxis = () => {
	const { time: { now }, graph: { scales } } = state;
	const then = now.epoch - scales.time;

	// Compute last round hour in epoch time
	const lastEpoch = getEpochTime(getLastRoundHour(now.date));
	
	// Get time axis round hours based on timescale and turn them into Date
	// objects
	const hours = getTimeAxisHours(scales.time).map((n) => {
		return new Date((lastEpoch + n * 3600) * 1000);
	});

	// Draw ticks and labels
	dom.graph.axes.time.ticks.forEach((tick, i) => {
		const label = dom.graph.axes.time.labels[i];

		// Compute tick hour
		const date = hours[i];
		const epoch = getEpochTime(date);
		const hour = formatTime(date.getHours());
		const minute = formatTime(date.getMinutes());

		// Position tick
		const x = (epoch - then) / scales.time * ui.graph.width;
		tick.setAttribute("x1", x);
		tick.setAttribute("y1", ui.graph.height);
		tick.setAttribute("x2", x);
		tick.setAttribute("y2", "100%");

		// Position and assign value to its label
		label.setAttribute("x", x - 6);
		label.setAttribute("y", ui.graph.height + 12);
		label.textContent = `${hour}:${minute}`;
	});
};


/**
 * DRAWGRAPHBGTARGETRANGE
 * Draw BG target range in graph
 */
const drawGraphBGTargetRange = () => {
	const { graph: { scales } } = state;
	const { low, high } = dom.graph.targets;

	// Compute position of targets in graph
	const y = {
		low: (1 - GRAPH_BG_LOW / scales.bg) * ui.graph.height,
		high: (1 - GRAPH_BG_HIGH / scales.bg) * ui.graph.height,
	};
  
	// Draw low target
	low.setAttribute("x1", 0);
	low.setAttribute("y1", y.low);
	low.setAttribute("x2", "100%");
	low.setAttribute("y2", y.low);

	// Draw high target
	high.setAttribute("x1", 0);
	high.setAttribute("y1", y.high);
	high.setAttribute("x2", "100%");
	high.setAttribute("y2", y.high);
};


/**
 * DRAW
 * Draw everything
 */
const draw = () => {
	drawDashTime();
	drawDashBG();
	drawGraphTimeAxis();
	drawGraphBGs();
};




/* -------------------------------------------------------------------------- */
/* APP FUNCTIONS                                                              */
/* -------------------------------------------------------------------------- */

/**
 * UPDATETIME
 * Update current time in app state
 */
const updateTime = () => {
	setCurrentTime(new Date());
};


/**
 * UPDATE
 * Try fetching new data, then draw current state of the app
 */
const update = () => {
	
	// Update and read current time
	updateTime();
	const { now, lastUpload } = state.time;
	const dt = now.epoch - lastUpload.epoch;

	// Only fetch every given time rate: only re-draw if too early
	if (dt < BG_REFRESH_RATE) {
		console.log(`Last BG uploaded less than ${Math.ceil(dt / 60)} minute(s) ago.`);
		draw();
		return;
	}

	// Fetch and update BGs in state, then re-draw
	getBGs().then(() => {
		drawGraphBGTargetRange();
		draw();
	});
};


/**
 * ROTATETIMESCALE
 * Use next available timescale and re-draw components related to it
 */
const rotateTimescale = () => {
	state.graph.scales.time = timescales.next().value;
	
	drawGraphTimeAxis();
	drawGraphBGs();
};




/* -------------------------------------------------------------------------- */
/* MAIN                                                                       */
/* -------------------------------------------------------------------------- */
window.onload = () => {

	// Pausing/resuming the app
	document.addEventListener("visibilitychange", () => {
		
		// Paused
		if (document.hidden) {
			console.log("The app was paused.");
		}
		
		// Resumed
		else {
			console.log("The app was resumed.");
			update();
		}
	});

	// When pressing on back button
	document.addEventListener("tizenhwkey", (e) => {
		if(e.keyName === "back") {
			tizen.application.getCurrentApplication().exit();
		}
	});

	// When touching app
	document.addEventListener("click", rotateTimescale);

	// Draw static components
	drawGraphTimeAxisNow();

	// Initial draw
	update();

	// Every minute: update app state and re-draw
	setInterval(update, TIME_REFRESH_RATE * 1000);
	
};