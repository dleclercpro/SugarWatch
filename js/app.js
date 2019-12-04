/* -------------------------------------------------------------------------- */
/* File: app.js                                                               */
/* App: SugarWatch                                                              */
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

// BGs
const BG_UNITS = "mmol/L";
const BG_NONE = "---";
const BG_MAX_AGE = 15 * 60;   // [s]
const BG_MAX_DELTA = 10 * 60; // [s]

// Graph
const GRAPH_BG_MIN = 0;                             // [mmol/L]
const GRAPH_BG_MAX = 16;                            // [mmol/L]
const GRAPH_BG_LOW = 3.8;                           // [mmol/L]
const GRAPH_BG_HIGH = 8.0;                          // [mmol/L]
const GRAPH_BG_SCALE = GRAPH_BG_MAX - GRAPH_BG_MIN; // [mmol/L]
const GRAPH_TIME_PADDING = 0.2;                     // [-]
const GRAPH_TIME_AXIS_HEIGHT = 20;                  // [px]

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
		now: {
			date: null,
			epoch: 0,
		},
	},
	graph: {
		bgs: [],
		timescale: timescales.next().value,
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
const ui = {
	graph: dom.graph.self.getBoundingClientRect(),
};


// CLASSES
class DownloadRequest {
	
	constructor(url, headers) {
		this.url = url;
		this.dir = "wgt-private-tmp";
		this.headers = headers;

		// Define request and its headers
		this.request = new tizen.DownloadRequest(this.url, this.dir);
		this.request.httpHeader = this.headers;
	}

	get() {
		return this.request;
	}

	set(request) {
		this.request = request;
	}

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
 * UPDATETIME
 * Update app's current time
 */
const updateTime = () => {
	const now = new Date();

	state.time.now = {
		date: now,
		epoch: getEpochTime(now),
	};
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
 * COMPAREBGS
 * BG comparator
 */
const compareBGs = (bg1, bg2) => {
	if (bg1.t < bg2.t) { return -1; }
	if (bg1.t > bg2.t) { return 1; }
	return 0;
};




/* -------------------------------------------------------------------------- */
/* DOWNLOAD FUNCTIONS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * FETCH
 * Returns a promise that resolves to the parsed content of the file retrieved
 * from the given URL, using an HTTP GET request.
 */
const fetch = (url, headers = {}, method = "GET", async = true, parse = JSON.parse) => {
	return new Promise((resolve, reject) => {
		console.log(`Fetching data at: ${url}`);
		const request = new XMLHttpRequest();

		// Success callback
		const onsuccess = () => {
			console.log("Fetched data successfully.");
			resolve(parse(request.response));
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
 * LOADBGS
 * Load BGs from JSON object into app state
 */
const loadBGs = (json) => {
	console.log("Loading BG data into app state...");
	const { time: { now } } = state;
				
	// Get BG times from JSON
	const times = Object.keys(json);

	// Make BG objects with epoch time, and keep only the last 24 hours
	const bgs = times.map((t) => {
		return { t: getEpochTime(parseTime(t)), bg: json[t] };
	}).filter((bg) => {
		return bg.t >= now.epoch - TIME_24_H;
	});
	
	// Sort them
	bgs.sort(compareBGs);
	
	// Store them in state
	state.graph.bgs = bgs;
	console.log("BG data loaded.");
};


/**
 * GETBGS
 * Fetch recent BGs from server and inject them into app state
 */
const getBGs = () => {
	return fetch(BG_REQUEST_URL, BG_REQUEST_HEADERS)
		.then(loadBGs)
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
 * COLORBG
 * Color DOM element based on its corresponding BG value
 */
const colorBG = (bg) => {
	if (bg >= GRAPH_BG_HIGH) {
		return COLOR_BG_HIGH;
	} else if (bg <= GRAPH_BG_LOW) {
		return COLOR_BG_LOW;
	} else {
		return COLOR_BG_NORMAL;
	}
};


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
	const isDeltaValid = last !== undefined ? bg.t - last.t < BG_MAX_DELTA : false;

	// Update current BG and style it accordingly
	if (bg !== undefined) {
		dom.dash.bg.innerHTML = formatBG(bg.bg);
		dom.dash.bg.style.color = colorBG(bg.bg);
		dom.dash.bg.style.textDecoration = isOld ? "line-through" : "none";

	} else {
		dom.dash.bg.innerHTML = BG_NONE;
	}

	// Update latest BG delta and style it as well
	if (isDeltaValid) {
		dom.dash.delta.innerHTML = `(${formatDeltaBG(bg.bg - last.bg)})`;
		dom.dash.delta.style.color = colorBG(bg.bg);
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
	const { time: { now }, graph: { bgs, timescale } } = state;

	// Get initial time in graph
	const then = now.epoch - timescale;

	// Define BG element radius based on current timescale
	let r;
	switch (timescale) {
		case TIME_3_H:
			r = 3;
			break;
		case TIME_6_H:
			r = 2.5;
			break;
		case TIME_12_H:
			r = 2;
			break;
		case TIME_24_H:
			r = 1.5;
			break;
	}

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
		const x = ((bg.t - then) / timescale - GRAPH_TIME_PADDING) * ui.graph.width;
		const y = (GRAPH_BG_MAX - bg.bg) / GRAPH_BG_SCALE * (ui.graph.height - GRAPH_TIME_AXIS_HEIGHT);

		// Draw it
		el.setAttribute("r", r);
		el.setAttribute("cx", x);
		el.setAttribute("cy", y);

		// Color it according to its BG value
		el.style.fill = colorBG(bg.bg);

		// Show it
		show(el);
	});
};


/**
 * DRAWGRAPHTIMEAXISNOW
 * Draw current time tick (line) in graph
 */
const drawGraphTimeAxisNow = () => {
	const x = (1 - GRAPH_TIME_PADDING) * ui.graph.width;
	dom.graph.axes.time.now.setAttribute("x1", x);
	dom.graph.axes.time.now.setAttribute("y1", 0);
	dom.graph.axes.time.now.setAttribute("x2", x);
	dom.graph.axes.time.now.setAttribute("y2", "100%");
};


/**
 * DRAWGRAPHTIMEAXIS
 * Draw time axis according to current state time
 */
const drawGraphTimeAxis = () => {
	const { time: { now }, graph: { timescale } } = state;
	const then = now.epoch - timescale;

	// Compute last round hour in epoch time
	const lastEpoch = getEpochTime(getLastRoundHour(now.date));
	
	// Initialize round tick hours from now
	let hours;

	// Define them based on used timescale
	switch (timescale) {
		case TIME_3_H:
		  hours = [-2, -1, 0];
		  break;
		  
		case TIME_6_H:
		  hours = [-4, -2, 0];
		  break;
		  
		case TIME_12_H:
		  hours = [-8, -4, 0];
		  break;
		  
		case TIME_24_H:
		  hours = [-16, -8, 0];
		  break;
		  
		default:
		  console.error("Incorrect time scale selected for time axis.");
		  return;
	}

	// Turn them into date objects
	hours = hours.map((n) => {
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
		const x = ((epoch - then) / timescale - GRAPH_TIME_PADDING) * ui.graph.width;
		tick.setAttribute("x1", x);
		tick.setAttribute("y1", ui.graph.height);
		tick.setAttribute("x2", x);
		tick.setAttribute("y2", ui.graph.height - GRAPH_TIME_AXIS_HEIGHT);

		// Position and assign value to its label
		label.setAttribute("x", x - 6);
		label.setAttribute("y", ui.graph.height - 6);
		label.textContent = `${hour}:${minute}`;
	});
};


/**
 * DRAWGRAPHBGTARGETRANGE
 * Draw BG target range in graph
 */
const drawGraphBGTargetRange = () => {
	const { low, high } = dom.graph.targets;

	// Compute position of targets in graph
	const h = (ui.graph.height - GRAPH_TIME_AXIS_HEIGHT);
	const y = {
		low: (GRAPH_BG_MAX - GRAPH_BG_LOW) / GRAPH_BG_SCALE * h,
		high: (GRAPH_BG_MAX - GRAPH_BG_HIGH) / GRAPH_BG_SCALE * h,
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
	
	// Draw them
	show(low);
	show(high);
};


/**
 * DRAWBGs
 * Draw BG-related components using current state
 */
const drawBGs = () => {
	getBGs().then(() => {
		drawDashBG();
		drawGraphTimeAxis();
		drawGraphBGs();
	});
};


/**
 * DRAWSTATIC
 * Draw static components
 */
const drawStatic = () => {
	drawGraphBGTargetRange();
	drawGraphTimeAxisNow();
};


/**
 * ROTATETIMESCALE
 * Use next available timescale and re-draw components related to it
 */
const rotateTimescale = () => {
	state.graph.timescale = timescales.next().value;
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
			updateTime();
			drawDashTime();
			drawBGs();
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
	drawStatic();

	// Initial draw
	updateTime();
	drawDashTime();
	drawBGs();

	// Every minute
	setInterval(() => {
		updateTime();
		drawDashTime();
	}, 60 * 1000);

	// Every 5 minutes
	setInterval(drawBGs, 5 * 60 * 1000);
    
};