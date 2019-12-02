/* -------------------------------------------------------------------------- */
/* File: app.js                                                               */
/* App: SugarBit                                                              */
/* Author: David Leclerc                                                      */
/* Date: 30.11.2019                                                           */
/* Version: 1.0.0                                                             */
/* -------------------------------------------------------------------------- */

// CONSTANTS
// Time
const TIME_INIT = new Date();
const TIME_3_H = 3 * 60 * 60;    // [s]
const TIME_6_H = 2 * TIME_3_H;   // [s]
const TIME_12_H = 2 * TIME_6_H;  // [s]
const TIME_24_H = 2 * TIME_12_H; // [s]
const TIME_REFRESH = 60 * 1000;  // Refreshing app rate [ms]

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


// STATE
const state = {
	time: {
		now: {
			date: TIME_INIT,
			epoch: TIME_INIT.getTime() / 1000,
		},
	},
	graph: {
		bgs: [],
		timescale: TIME_6_H,
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
				labels: document.querySelectorAll(".graph-axis-time-tick-label"),
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
 * DOWNLOAD
 * Returns a promise that resolves to the relative path of the requested file,
 * using a DownloadRequest object. The function works similarly to 'fetch', that
 * is it retrieves a file from a server using an HTTP GET request.
 */
const download = (request) => {
	return new Promise((resolve, reject) => {

		// Download if network is available
		tizen.systeminfo.getPropertyValue("NETWORK", (networkInfo) => {
			console.log(`Downloading file at: ${request.url}`);
			
			// No network
			if (networkInfo.networkType === "NONE") {
				reject("No network connection. Downloading is impossible.");
			}

			// Define a listener object for the download
			const listener = {
	
				// When download progresses
				onprogress: (id, i, n) => {
					console.log(`Progressing: [${id}] (${i}/${n})`);
				},
				
				// When user pauses download
				onpaused: (id) => {
					console.log(`Paused: [${id}]`);
				},
				
				// When user cancels download
				oncanceled: (id) => {
					console.log(`Canceled: [${id}]`);
				},
				
				// When download is completed
				oncompleted: (id, path) => {
					console.log(`Completed: [${id}] at '${path}' (${tizen.download.getMIMEType(id)})`);

					// Resolve promise with relative path to downloaded file
					resolve(path);
				},
				
				// When downloads failed
				onfailed: (id, err) => {
					reject(`Failed: [${id}] (${err.name})`);
				},
			};
			
			// Start download
			tizen.download.start(request.get(), listener);
		});
	});
};


/**
 * GETFILE
 * Returns a promise, which resolves to an object, corresponding to the parsed
 * content of the  file stored at given relative path
 */
const getFile = (filePath, parser = JSON.parse, encoding = "UTF-8") => {
	return new Promise((resolve, reject) => {
		const [ dirPath, _ ] = filePath.split("/").slice(-2);
		console.log("Getting and parsing file content...");

		// Get directory handler
		tizen.filesystem.resolve(dirPath, (dir) => {
			console.log("Got directory handler.");

			// Get file handler
			tizen.filesystem.resolve(filePath, (file) => {
				console.log("Got file handler.");

				// Read file content as string and parse as an object
				file.readAsText((str) => {
					const content = parser(str);
					console.log("File content parsed.");

					// Delete file once it's been parsed
					dir.deleteFile(filePath, () => {
						console.log("File deleted.");

						// Return content object
						resolve(content);
						
					}, (err) => {
						reject("Could not delete file once read.");
					});

				}, (err) => {
					reject("Could not read file content.");
				}, encoding);

			}, (err) => {
				reject("Could not get file handler.");
			}, "r");

		}, (err) => {
			reject("Could not get directory handler.");
		}, "rw");
	});
};


/**
 * LOADBGS
 * Load BGs from JSON object into app state
 */
const loadBGs = (json) => {
	console.log("Loading BG data into app state...");
	const { time: { now }, graph: { timescale } } = state;
				
	// Get BG times from JSON
	const times = Object.keys(json);

	// Make BG objects with epoch time, and keep only the ones that fit
	// in graph
	const bgs = times.map((t) => {
		return { t: getEpochTime(parseTime(t)), bg: json[t] };
	}).filter((bg) => {
		return bg.t >= now.epoch - timescale;
	});
	
	// Sort them
	bgs.sort(compareBGs);
	
	// Store them in state
	state.graph.bgs = bgs;
	console.log("BG data loaded.");
};


/**
 * FETCHBGS
 * Fetch recent BGs from server and store them in app state
 */
const fetchBGs = () => {
	return download(new DownloadRequest(BG_REQUEST_URL, BG_REQUEST_HEADERS))
		.then(getFile)
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
	const isOld = bg ? bg.t < now.epoch - BG_MAX_AGE : true;
	const isDeltaValid = last ? bg.t - last.t < BG_MAX_DELTA : false;

	// Update current BG and style it accordingly
	if (bg) {
		dom.dash.bg.innerHTML = formatBG(bg.bg);
		dom.dash.bg.style.color = colorBG(bg.bg);
		dom.dash.bg.style.textDecoration = isOld ? "line-through" : "none";

	} else {
		dom.dash.bg.innerHTML = BG_NONE;
	}

	// Update latest BG delta and style it as well
	if (!isOld && isDeltaValid) {
		dom.dash.delta.innerHTML = `(${formatDeltaBG(bg.bg - last.bg)})`;
		dom.dash.delta.style.color = colorBG(bg.bg);

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
		const x = (bg.t - then) / timescale * ui.graph.width;
		const y = (GRAPH_BG_MAX - bg.bg) / GRAPH_BG_SCALE * ui.graph.height;

		// Draw it
		el.setAttribute("r", 2);
		el.setAttribute("cx", x);
		el.setAttribute("cy", y);

		// Color it according to its BG value
		el.style.fill = colorBG(bg.bg);

		// Show it
		show(el);
	});
};


/**
 * DRAWGRAPHTIMEAXIS
 * Draw time axis according to current state time
 */
const drawGraphTimeAxis = () => {
	const { time: { now }, graph: { timescale } } = state;

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

	// Pad ticks
	dom.graph.axes.time.self.style.paddingRight = now.epoch - lastEpoch;

	// Draw ticks and labels
	dom.graph.axes.time.labels.forEach((label, i) => {
		const date = hours[i];
		const hour = formatTime(date.getHours());
		const minute = formatTime(date.getMinutes());

		// Write its label
		label.innerHTML = `${hour}:${minute}`;
	});
};


/**
 * DRAWBGTARGETRANGE
 * Draw BG target range in graph
 */
const drawBGTargetRange = () => {
	const { low, high } = dom.graph.targets;

	// Compute position of targets in graph
	const y = {
		low: (GRAPH_BG_MAX - GRAPH_BG_LOW) / GRAPH_BG_SCALE * ui.graph.height,
		high: (GRAPH_BG_MAX - GRAPH_BG_HIGH) / GRAPH_BG_SCALE * ui.graph.height,
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
 * DRAW
 * Re-draw app using current state
 */
const draw = () => {
	drawDashTime();
	drawGraphTimeAxis();

    fetchBGs().then(() => {
		drawDashBG();
		drawGraphBGs();
	});
};


/**
 * DRAWSTATIC
 * Draw elements that never change
 */
const drawStatic = () => {
	drawBGTargetRange();
};




/* -------------------------------------------------------------------------- */
/* MAIN                                                                       */
/* -------------------------------------------------------------------------- */
window.onload = () => {

	// When pressing on hardware key
    document.addEventListener("tizenhwkey", (e) => {
    	if(e.keyName === "back") {
    		tizen.application.getCurrentApplication().exit();
    	}
	});

	// Draw app
	drawStatic();
	draw();

	// Every minute
	setInterval(() => {
		updateTime();
		draw();

	}, TIME_REFRESH);
    
};