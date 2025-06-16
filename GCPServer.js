

const request = require('request');
const express = require('express');
const app = express();
const path = require('path');
const { JSDOM } = require('jsdom'); // Use JSDOM for parsing HTML
const puppeteer = require('puppeteer');


// Function to interpolate between two hex colors based on a given factor
function interpolateColor(color1, color2, factor) {
    const hexToInt = (hex) => parseInt(hex.slice(1), 16);
    const intToHex = (int) => "#" + int.toString(16).padStart(6, "0");

    const col1 = hexToInt(color1);
    const col2 = hexToInt(color2);

    const r = Math.round(((col2 >> 16) - (col1 >> 16)) * factor + (col1 >> 16));
    const g = Math.round((((col2 >> 8) & 0x00ff) - ((col1 >> 8) & 0x00ff)) * factor + ((col1 >> 8) & 0x00ff));
    const b = Math.round(((col2 & 0x0000ff) - (col1 & 0x0000ff)) * factor + (col1 & 0x0000ff));

    return intToHex((r << 16) + (g << 8) + b);
}

// Define color ranges based on high values with intermediate steps
const colorStops = [
    { value: 0.00, color: "#CDCDCD" }, // Gray
    { value: 0.01, color: "#FFA8C0" }, // Pink
    { value: 0.05, color: "#FF1E1E" }, // Red
    { value: 0.08, color: "#FFB82E" }, // Orange
    { value: 0.15, color: "#FFD517" }, // Orange Yellow
    { value: 0.23, color: "#FFFA40" }, // Yellow
    { value: 0.30, color: "#F9FA00" }, // Yellow Green
    { value: 0.40, color: "#AEFA00" }, // Light Green
    { value: 0.90, color: "#64FA64" }, // Green
    { value: 0.9125, color: "#64FAAB" }, // Teal
    { value: 0.93, color: "#ACF2FF" }, // Teal/Light Blue
    { value: 0.96, color: "#0EEEFF" }, // Light Blue
    { value: 0.98, color: "#24CBFD" }, // Blue
    { value: 1.00, color: "#5655CA" }, // Magenta
];

const axios = require("axios"); // Use axios to fetch the data


async function fetchGCPDotPercentage() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    await page.setViewport({ width: 600, height: 280 }); // Set correct viewport to match internal canvas size

    // Capture network requests to extract the GCP data
    page.on("response", async (response) => {
        if (response.url().includes("gcpgraph.php")) {
            const text = await response.text();

            // Extracting the relevant GCP data from the response
            const matches = [...text.matchAll(/a=["']([\d.]+)["']/g)];
            if (matches.length > 0) {
                const latestAverage = parseFloat(matches[matches.length - 1][1]);

                // Convert to percentage
                let percentage = Math.min(100, Math.round(latestAverage * 10000) / 100);
                
                console.log(`🔴 Corrected Live GCP Coherence Percentage: ${percentage.toFixed(2)}%`);
            } else {
                console.warn("⚠️ No valid GCP data found in response.");
            }
        }
    });

    // Load the GCP Dot page and ensure correct scaling
    await page.goto("https://global-mind.org/gcpdot/gcpchart.php", { waitUntil: "networkidle2" });

    // Extract the GCP Dot's position relative to the canvas size
    await page.waitForSelector("#gcpChart"); // Ensure the chart is loaded

    const dotPosition = await page.evaluate(() => {
        const dot = document.querySelector("div[id^='gcpdot']");
        if (!dot) return null;

        const dotStyle = window.getComputedStyle(dot);
        const topValue = parseFloat(dotStyle.top); // Get 'top' position in px

        // Scale factor: The displayed canvas is half the internal resolution
        const scaleFactor = 600 / 300; // Internal / Displayed
        const adjustedTop = topValue * scaleFactor; // Convert to internal scale

        return adjustedTop;
    });

    if (dotPosition !== null) {
        console.log(`🎯 Scaled GCP Dot Position: ${dotPosition}px`);
    } else {
        console.warn("⚠️ GCP Dot not found.");
    }

    // Wait 10 seconds to capture the request (GCP updates roughly every minute)
    await new Promise((resolve) => setTimeout(resolve, 10000));

    await browser.close();
}

// Run the function once every 3 seconds
setInterval(fetchGCPDotPercentage, 3000);
fetchGCPDotPercentage(); // Initial call


fetch('https://gcpdot.com/gcpchart.php')
  .then(response => response.text())
  .then(data => {
      const match = data.match(/<div id="gcpdot\d+" style="position: absolute; top: ([\d.]+)px;/);
      if (match) {
          const topPosition = parseFloat(match[1]);
          const frequencyPercentage = Math.min(100, Math.max(0, (100 - (topPosition / 100 * 100))));
          console.log(`GCP Frequency Percentage: ${frequencyPercentage.toFixed(2)}%`);
      } else {
          console.log('GCP data not found');
      }
  })
  .catch(error => console.error('Error fetching GCP data:', error));


  (async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://gcpdot.com/gcpchart.php');

    // Wait for the specific div to load
    await page.waitForSelector('div[id^="gcpdot"]');

    // Extract the 'top' position
    const topPosition = await page.$eval('div[id^="gcpdot"]', el => parseFloat(getComputedStyle(el).top));
    const frequencyPercentage = Math.min(100, Math.max(0, (100 - (topPosition / 100 * 100))));
    console.log(`GCP Frequency Percentage: ${frequencyPercentage.toFixed(2)}%`);

    await browser.close();
})()

// Function to determine color & percentage based on "high" value
function getColorAndPercentage(high) {
    for (let i = 0; i < colorStops.length - 1; i++) {
        const start = colorStops[i];
        const end = colorStops[i + 1];
        if (high >= start.value && high < end.value) {
            const factor = (high - start.value) / (end.value - start.value);
            const interpolatedColor = interpolateColor(start.color, end.color, factor);

            // Convert high value to a percentage with decimals (e.g., 2 decimal places)
            const percentage = (high * 100).toFixed(2);

            return { color: interpolatedColor, percentage };
        }
    }
    // If "high" is beyond the last color stop:
    return { color: colorStops[colorStops.length - 1].color, percentage: (100).toFixed(2) };
}

app.get("/api/gcpdot", function (req, res) {
    const url = "https://global-mind.org/gcpdot/gcpgraph.php?pixels=457&seconds=-86400&nonce=" + Date.now();

    request.get(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let high = 0;
            const matches = body.match(/(0\.\d+)/g);
            if (matches) {
                matches.forEach((gcp) => {
                    if (parseFloat(gcp) > high) high = parseFloat(gcp);
                });
            }

            const { color, percentage } = getColorAndPercentage(high);

            res.json({ color, percentage, high });
        } else {
            console.error("Error fetching GCP Dot data:", error);
            res.status(500).send("Error fetching GCP Dot data");
        }
    });
});


// Function to determine color based on high value
function getColorFromHigh(high) {
    for (let i = 0; i < colorStops.length - 1; i++) {
        const start = colorStops[i];
        const end = colorStops[i + 1];
        if (high >= start.value && high < end.value) {
            const factor = (high - start.value) / (end.value - start.value);
            return interpolateColor(start.color, end.color, factor);
        }
    }
    return colorStops[colorStops.length - 1].color;
}

// Function to parse GCP Dot data from the response body
function parseGCPDotData(responseText) {
    const pTagRegex = /<p i="([\d]+)" a="([\d.]+)" t="([\d.]+)" q1="([\d.]+)" q3="([\d.]+)" b="([\d.]+)" \/>/g;
    let match;
    const parsedData = [];

    while ((match = pTagRegex.exec(responseText))) {
        parsedData.push({
            i: parseInt(match[1]),       // Index
            a: parseFloat(match[2]),     // Average
            t: parseFloat(match[3]),     // Top
            q1: parseFloat(match[4]),    // Q1
            q3: parseFloat(match[5]),    // Q3
            b: parseFloat(match[6])      // Bottom
        });
    }

    return parsedData;
}

// Endpoint to serve the parsed GCP Dot Data
app.get('/api/gcpdotdata', function(req, res) {
    const url = 'https://global-mind.org/gcpdot/gcpgraph.php?pixels=457&seconds=-86400&nonce=' + Date.now();

    request.get(url, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            const parsedData = parseGCPDotData(body);
            res.json(parsedData);
        } else {
            console.error('Error fetching GCP Dot data:', error);
            res.status(500).send('Error fetching GCP Dot data');
        }
    });
});




// Serve the main page with GCP Dot and Chart
app.get('/', function(req, res) {
    request.get("http://gcpdot.com/gcpindex.php?small=1", function(err, response, body) {
        if (err || response.statusCode !== 200 || typeof body !== "string") {
            console.error('Error fetching GCP dot data:', err);
            return res.send("Error fetching GCP dot data");
        }

        let high = 0;
        const matches = body.match(/(0\.\d+)/g);
        if (matches) {
            matches.forEach(function(gcp) {
                if (parseFloat(gcp) > high) high = parseFloat(gcp);
            });
        }

        // Use getColorAndPercentage to get both color & percentage
        const { color, percentage } = getColorAndPercentage(high);

        console.log('High Value Detected:', high);
        console.log('Color Determined:', color);
        console.log('Color Percentage:', percentage);

        // Inject the color and percentage directly into the HTML markup
        // so the client can see them right away:
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>GCP Dot and Chart</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: ${color}; /* set the background to the interpolated color */
        }
        #colorCode {
            margin-top: 10px;
            font-size: 24px;
            font-weight: bold;
        }
        #percentageDisplay {
            font-size: 18px;
            margin-top: 8px;
        }
        #gcpChartContainer {
            position: relative;
            width: 80%;
            height: 600px;
            margin: 20px auto;
            border: 1px solid #ccc;
            background-color: #fff;
        }
    </style>
</head>
<body>
    <!-- The GCP Dot iframe -->
    <iframe src="https://global-mind.org/gcpdot/gcp.html" height="48" width="48"
            scrolling="no" frameborder="0"></iframe>

    <!-- Show the hex color we got -->
    <div id="colorCode">Color: ${color}</div>

    <!-- Show the color “percentage” we got -->
    <div id="percentageDisplay">
      Color Rarity:
      <span id="colorPercentage">${percentage}</span>%
    </div>

    <div id="gcp-percentage">Loading GCP Data...</div>


    <!-- Chart container -->
    <div id="gcpChartContainer"></div>

    <!-- Optionally load your chart script here if you want -->
</body>
</html>
        `;

        res.send(html);
    });
});


// Serve static files (e.g., if you have additional assets)
app.use(express.static('public'));

// Start the server
const server = app.listen(8888, function() {
    console.log('Server listening on port %d', server.address().port);
});

// Function to generate the gcpchart.js script content
function generateGcpChartJs() {
    return `
function gcpchart_initialize(id) {
    var chart = {
        element: null,
        dataSource: '/api/gcpdotdata',
        dataLoaderTimeout: null,
        canvas: null,
        lastCanvasWidth: -1,
        errorTime: 1,
        defaultBaseErrorTime: 1,

        graphics: {
            dotSize: 15,
            shadowOffset: 10,
            gscalar: 1,
            bscalar: 1,
            element: null,
            canvas: null,
            context: null,
            canvasShadow: null,
            contextShadow: null,
            lineDiv: null,
            dataDiv: null,
            lastData: null,

            bgImage: null,
            imgBuffer: null,

            initialize: function (element) {
                this.element = element;

                this.lineDiv = document.createElement('div');
                this.lineDiv.style.position = 'absolute';
                this.lineDiv.style.top = '20px';
                this.lineDiv.style.left = '0px';
                this.lineDiv.style.width = '1px';
                this.lineDiv.style.zIndex = 1010;
                this.lineDiv.style.borderLeft = '1px solid rgba(255, 255, 255, 1)';
                this.lineDiv.style.display = 'none';
                element.appendChild(this.lineDiv);

                this.dataDiv = document.createElement('div');
                this.dataDiv.style.position = 'absolute';
                this.dataDiv.style.top = '20px';
                this.dataDiv.style.left = '0px';
                this.dataDiv.style.width = '100px';
                this.dataDiv.style.zIndex = 1011;
                this.dataDiv.style.border = '1px solid rgba(255, 255, 255, 0.93)';
                this.dataDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.50)';
                this.dataDiv.style.boxShadow = '4px 4px 8px rgba(0,0,0,0.73)';
                this.dataDiv.style.display = 'none';
                element.appendChild(this.dataDiv);

                // Shadow canvas must be instantiated first to render properly
                this.canvasShadow = document.createElement('canvas');
                this.canvasShadow.id = 'gcpChartShadow';
                this.canvasShadow.style.position = 'absolute';
                this.canvasShadow.style.zIndex = 1000;
                element.appendChild(this.canvasShadow);

                // The chart canvas must be instantiated second to be on top of the shadow canvas
                this.canvas = document.createElement('canvas');
                this.canvas.id = 'gcpChart';
                this.canvas.style.position = 'absolute';
                this.canvas.style.zIndex = 1001;
                element.appendChild(this.canvas);
                element.appendChild(this.lineDiv);
                this.resetCanvasSize();
                this.makeImages();

                var self = this;
                this.element.addEventListener("mousemove", function (event) {
                    if (!self.lastData)
                        return;
                    if (self.lineDiv.style.display == 'none') {
                        self.lineDiv.style.display = '';
                        self.dataDiv.style.display = '';
                    }
                    var rect = self.element.getBoundingClientRect();
                    var x = event.clientX - rect.left;
                    var index = Math.floor(x * self.gscalar / self.bscalar);
                    if (!self.lastData[index]) {
                        self.lineDiv.style.display = 'none';
                        self.dataDiv.style.display = 'none';
                        return;
                    }
                    var d = self.lastData[index];
                    self.dataDiv.innerHTML = Math.min(100, Math.round(d.a * 10000) / 100) + '%';
                    if (x < self.element.offsetWidth - self.dataDiv.offsetWidth) {
                        self.lineDiv.style.left = x + 'px';
                        self.dataDiv.style.left = (x + 3) + 'px';
                    } else {
                        self.lineDiv.style.left = x + 'px';
                        self.dataDiv.style.left = (x - 3 - self.dataDiv.offsetWidth) + 'px';
                    }
                    self.dataDiv.style.top =
                        Math.floor(d.a * self.canvas.offsetHeight - self.dataDiv.offsetHeight / 2 +
                            self.canvas.offsetTop) + 'px';
                });
                this.element.addEventListener("mouseout", function () {
                    self.lineDiv.style.display = 'none';
                    self.dataDiv.style.display = 'none';
                });

                return this.canvas;
            },
            resetCanvasSize: function () {
                var w = this.element.offsetWidth, h = this.element.offsetHeight - 40;
                this.gscalar = window.devicePixelRatio || 1;
                this.canvas.width = w;
                this.canvas.height = h;
                this.canvasShadow.width = w;
                this.canvasShadow.height = h;
                this.lineDiv.style.height = h + 'px';

                this.context = this.canvas.getContext('2d');
                this.contextShadow = this.canvasShadow.getContext('2d');
                this.bscalar = this.context.webkitBackingStorePixelRatio ||
                    this.context.mozBackingStorePixelRatio ||
                    this.context.msBackingStorePixelRatio ||
                    this.context.oBackingStorePixelRatio ||
                    this.context.backingStorePixelRatio || 1;

                if (this.gscalar != this.bscalar) { // Adjust canvas for High Definition Displays like Apple Retina
                    var ratio = this.gscalar / this.bscalar;
                    this.canvas.style.width = w + 'px';
                    this.canvas.style.height = h + 'px';
                    this.canvas.width = w * ratio;
                    this.canvas.height = h * ratio;
                    this.context.scale(ratio, ratio);

                    this.canvasShadow.style.width = w + 'px';
                    this.canvasShadow.style.height = h + 'px';
                    this.canvasShadow.width = w * ratio;
                    this.canvasShadow.height = h * ratio;
                    this.contextShadow.scale(ratio, ratio);
                }
                this.lastCanvasWidth = this.canvas.offsetWidth;
            },
            makeImages: function () {
                if (this.bgImage && this.bgImage.width == this.canvas.width)
                    return;
                if (this.bgImage)
                    delete this.bgImage;

                var self = this;
                var svg = "<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='xMidYMid meet' width='"
                    + this.canvas.width + "' height='" + this.canvas.height + "' version='1.1'><defs><linearGradient id='g' x1='0%' y1='0%' x2='0%' y2='100%'><stop offset='0%' style='stop-color:#FF00FF;stop-opacity:1' /><stop offset='1%' style='stop-color:#FF0000;stop-opacity:1' /><stop offset='3.5%' style='stop-color:#FF4000;stop-opacity:1' /><stop offset='6%' style='stop-color:#FF7500;stop-opacity:1' /><stop offset='11%' style='stop-color:#FFB000;stop-opacity:1' /><stop offset='22%' style='stop-color:#FFFF00;stop-opacity:1' /><stop offset='50%' style='stop-color:#00df00;stop-opacity:1' /><stop offset='90%' style='stop-color:#00df00;stop-opacity:1' /><stop offset='94%' style='stop-color:#00EEFF;stop-opacity:1' /><stop offset='99%' style='stop-color:#0034F4;stop-opacity:1' /><stop offset='100%' style='stop-color:#440088;stop-opacity:1' /></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)' /></svg>";
                this.bgImage = new Image();

                this.bgImage.width = this.canvas.width - this.dotSize / 2 * this.gscalar / this.bscalar;
                this.bgImage.height = this.canvas.height;
                this.bgImage.src = "data:image/svg+xml;base64," + btoa(svg);
                this.bgImage.addEventListener('load', function () {
                    self.context.drawImage(self.bgImage, 0, 0, self.bgImage.width, self.bgImage.height,
                        0, 0, self.canvas.offsetWidth, self.canvas.offsetHeight);
                    if (self.imgBuffer)
                        delete self.imgBuffer;
                    self.imgBuffer = self.context.getImageData(0, 0, self.bgImage.width, self.bgImage.height);
                    for (var y = 0; y < self.bgImage.height; y++)
                        for (var x = 0; x < self.bgImage.width; x++)
                            self.imgBuffer.data[(y * self.bgImage.width + x) * 4 + 3] = 0;
                    self.context.clearRect(0, 0, self.canvas.width, self.canvas.height);
                });
                this.bgImage.addEventListener('error', function (e) {
                    console.info("Error loading Rainbow Image - " + svg);
                });
            },
            renderChart: function (data) {
                this.lastData = data;
                var w = this.canvas.offsetWidth, h = this.canvas.offsetHeight, ch = this.canvas.height;
                var inv_ch = 1.0 / ch;

                var imgShadowBuffer = this.contextShadow.createImageData(this.bgImage.width, this.bgImage.height);

                // Set the alpha for just the graph pixels
                for (var i = 0; i < data.length; i++) {
                    if (!data[i])
                        continue;
                    if ((data[i].b - data[i].t) < inv_ch)
                        if (data[i].t > 0.5)
                            data[i].t -= inv_ch;
                    for (var y = Math.floor(data[i].t * ch); y < data[i].b * ch; y++) {
                        var ys = y / ch;
                        var a = 0;
                        if (ys > data[i].q1 && ys <= data[i].q3 || (data[i].b - data[i].t) < inv_ch * 1.5)
                            a = 1;
                        else if (ys > data[i].t && ys <= data[i].q1)
                            a = (ys - data[i].t) / (data[i].q1 - data[i].t);
                        else if (ys > data[i].q3 && ys <= data[i].b)
                            a = (data[i].b - ys) / (data[i].b - data[i].q3);
                        if (this.imgBuffer)
                            this.imgBuffer.data[(i + y * this.bgImage.width) * 4 + 3] = 255 * a;
                        imgShadowBuffer.data[(i + y * this.bgImage.width) * 4 + 3] = Math.pow(a, 0.75) * 255;
                    }
                }
                // Blur the shadow
                stackBlurCanvasAlpha(imgShadowBuffer.data, this.bgImage.width, this.bgImage.height, 6);

                this.contextShadow.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.contextShadow.globalAlpha = 1.0;
                this.contextShadow.putImageData(imgShadowBuffer, this.shadowOffset, this.shadowOffset);

                this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.context.globalAlpha = 1.0;
                if (this.imgBuffer)
                    this.context.putImageData(this.imgBuffer, 0, 0);

                // Reset the alpha for just the graph pixels back to transparent
                for (var i = 0; i < data.length; i++)
                    if (data[i] && this.imgBuffer)
                        for (var y = Math.floor(data[i].t * ch); y < data[i].b * ch; y++)
                            this.imgBuffer.data[i * 4 + y * this.bgImage.width * 4 + 3] = 0;

                delete imgShadowBuffer;
            }
        },

        initialize: function (id, clickUrl) {
            var self = this;

            this.element = document.getElementById(id);

            this.element.appendChild(header = document.createElement('div'));
            header.style.position = 'absolute';
            header.style.textAlign = 'center';
            header.style.height = '20px';
            header.style.width = '100%';
            header.style.top = '0px';
            header.style.backgroundColor = 'rgba(250, 250, 250, 0.9)';
            header.appendChild(link = document.createElement('a'));
            link.innerHTML = '24 Hour GCP Graph';
            link.href = clickUrl;
            link.style.fontFamily = 'Arial';
            link.style.fontWeight = 'bold';
            link.style.textDecoration = 'none';
            link.style.color = 'black';

            this.canvas = this.graphics.initialize(this.element);
            this.canvas.style.backgroundColor = 'rgba(0, 0, 0, 0)';
            this.canvas.style.top = '20px';
            this.canvas.style.left = '0px';
            this.graphics.canvasShadow.style.backgroundColor = 'rgba(64, 64, 64, .9)';
            this.graphics.canvasShadow.style.top = '20px';
            this.graphics.canvasShadow.style.left = '0px';
            this.graphics.canvasShadow.style.boxShadow = '0px 5px 10px rgba(0,0,0,0.5)';
            this.lastCanvasWidth = this.canvas.offsetWidth;

            this.element.appendChild(footer = document.createElement('div'));
            footer.style.position = 'absolute';
            footer.style.height = '20px';
            footer.style.width = '100%';
            footer.style.bottom = '0px';
            footer.appendChild(span = document.createElement('span'));
            span.innerHTML = '&nbsp;24 Hours Ago';
            span.style.float = 'left';
            span.style.fontFamily = 'Arial';
            span.style.fontSize = '90%';
            footer.appendChild(span = document.createElement('span'));
            span.innerHTML = 'Now&nbsp;';
            span.style.float = 'right';
            span.style.fontFamily = 'Arial';
            span.style.fontSize = '90%';

            window.addEventListener('resize', function () {
                if (self.element.offsetWidth != self.lastCanvasWidth) {
                    self.graphics.resetCanvasSize();
                    self.lastCanvasWidth = self.element.offsetWidth;
                    if (self.dataLoaderTimeout)
                        clearTimeout(self.dataLoaderTimeout);
                    self.dataLoaderTimeout = setTimeout(function () {
                        self.dataLoaderTimeout = null;
                        self.graphics.makeImages();
                        self.getData();
                    }, 3000);
                }
            });
            this.getData();
        },
        getData: function () {
            var self = this;

            fetch(this.dataSource)
                .then(response => response.json())
                .then(data => {
                    self.errorTime = self.defaultBaseErrorTime;

                    var graph = data;
                    graph.forEach(function (d) {
                        d.t = 1 - d.t;
                        d.q1 = 1 - d.q1;
                        d.a = 1 - d.a;
                        d.q3 = 1 - d.q3;
                        d.b = 1 - d.b;
                    });

                    self.dataLoaderTimeout = setTimeout(function () {
                        self.dataLoaderTimeout = null;
                        self.getData();
                    }, (60 - (((new Date()).getMilliseconds() / 1000 - 6.0) % 60) + Math.random() * 30) * 1000);
                    self.graphics.renderChart(graph);
                })
                .catch(function () {
                    self.dataLoaderTimeout = setTimeout(function () {
                        self.dataLoaderTimeout = null;
                        self.getData();
                    }, self.errorTime * 1000);
                    self.errorTime *= 1.5;
                    if (self.errorTime > 300)
                        self.errorTime = 300;
                });
        }
    };
    chart.initialize(id, 'https://global-mind.org/gcpdot/');
    return chart;
}

/* Include the StackBlur algorithm functions here */
function stackBlurCanvasAlpha(pixels, width, height, radius) {
    // Include the full implementation of the stackBlurCanvasAlpha function here.
    // As it's quite lengthy, make sure to include all the logic from the original code.
}
`;
}




