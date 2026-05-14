// Size of canvas. These get updated to fill the whole browser.
let width = 600;
let height = 600;

// Boids variables:
const numBoids = 15;
let coherence = 0.005; // 0 to .01
let separation = 0.05; // 0 to .1
let alignment = 0.05; // 0 to .1
let visualRange = 50; // 0 to 200
let anticlick = 0.01;
let durationDivisions = 1.5;
const speedLimit = 3;

// Music variables
const minNote = -35;
const maxNote = 24;
const minVolume = -45;
const maxVolume = -15;
const minDurationAbsolute = 0.065;
const maxDurationAbsolute = 8;
let maxSubdivisionPower = Math.floor(Math.log(maxDurationAbsolute/minDurationAbsolute)/Math.log(durationDivisions))
const SHINE_CONSTANT = 15;
const ANTICLICK_BUFFER = 0.01;

// Interface variables
const DARK_COLOR = "#063"
const BRIGHT_COLOR = "#5fb"

modes = {
  "smooth": [],
  "chromatic": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "diatonic": [0, 2, 4, 5, 7, 9, 11],
  "pentatonic": [0, 2, 4, 7, 9],
  "wholetone": [0, 2, 4, 6, 8, 10],
  "diminished": [0, 3, 6, 9],
  "augmented": [0, 4, 8],
  "major": [0, 4, 7],
  "minor": [0, 3, 7],
  "just major": [0, 12*Math.log2(5/4), 12*Math.log2(3/2)],
  "just minor": [0, 12*Math.log2(6/5), 12*Math.log2(3/2)]
}

let mode = modes["pentatonic"]

yAxisTypes = ["volume", "duration", "pluck"]
Y_VOLUME = 0
Y_DURATION = 1
Y_PLUCK = 2

let yAxis = 0
var boids = [];

function mod(x, n) {
    return ((x%n)+n)%n;
};

function initBoids() {
  for (var i = 0; i < numBoids; i += 1) {
    boids[i] = {
      id: i,
      x: Math.random() * width,
      y: Math.random() * height,
      dx: Math.random() * 10 - 5,
      dy: Math.random() * 10 - 5,
      history: [],
      osc: new Tone.Oscillator(440, "sine1"),
      gain: new Tone.Gain(1).toDestination(),
      shineTimer: 0
    };
    boids[i].osc.frequency.value = calculateFrequency(boids[i].x)
    boids[i].osc.connect(boids[i].gain)
    boids[i].gain.gain.value = 0
    boids[i].osc.volume.value = -20
    boids[i].osc.start()
  }
}

function resetBoid(boid) {
    boid.gain.gain.rampTo(0, anticlick)
    boid.osc.volume.value = -20
    boid.osc.frequency.value = calculateFrequency(boid.x)
}

function distance(boid1, boid2) {
  return Math.sqrt(
    (boid1.x - boid2.x) * (boid1.x - boid2.x) +
      (boid1.y - boid2.y) * (boid1.y - boid2.y),
  );
}

// TODO: This is naive and inefficient.
function nClosestBoids(boid, n) {
  // Make a copy
  const sorted = boids.slice();
  // Sort the copy by distance from `boid`
  sorted.sort((a, b) => distance(boid, a) - distance(boid, b));
  // Return the `n` closest
  return sorted.slice(1, n + 1);
}

// Called initially and whenever the window resizes to update the canvas
// size and width/height variables.
function sizeCanvas() {
  const canvas = document.getElementById("boids");
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
}

// Constrain a boid to within the window. If it gets too close to an edge,
// nudge it back in and reverse its direction.
function keepWithinBounds(boid) {
  const margin = 100;
  const turnFactor = .5;

  if (boid.x < margin) {
    boid.dx += turnFactor;
  }
  if (boid.x > width - margin) {
    boid.dx -= turnFactor
  }
  if (boid.y < margin) {
    boid.dy += turnFactor;
  }
  if (boid.y > height - margin) {
    boid.dy -= turnFactor;
  }
}

// Find the center of mass of the other boids and adjust velocity slightly to
// point towards the center of mass.
function flyTowardsCenter(boid) {

  let centerX = 0;
  let centerY = 0;
  let numNeighbors = 0;

  for (let otherBoid of boids) {
    if (distance(boid, otherBoid) < visualRange) {
      centerX += otherBoid.x;
      centerY += otherBoid.y;
      numNeighbors += 1;
    }
  }

  if (numNeighbors) {
    centerX = centerX / numNeighbors;
    centerY = centerY / numNeighbors;

    boid.dx += (centerX - boid.x) * coherence;
    boid.dy += (centerY - boid.y) * coherence;
  }
}

// Move away from other boids that are too close to avoid colliding
function avoidOthers(boid) {
  const minDistance = 20; // The distance to stay away from other boids
  let moveX = 0;
  let moveY = 0;
  for (let otherBoid of boids) {
    if (otherBoid !== boid) {
      if (distance(boid, otherBoid) < minDistance) {
        moveX += boid.x - otherBoid.x;
        moveY += boid.y - otherBoid.y;
      }
    }
  }

  boid.dx += moveX * separation;
  boid.dy += moveY * separation;
}

// Find the average velocity (speed and direction) of the other boids and
// adjust velocity slightly to match.
function matchVelocity(boid) {
  let avgDX = 0;
  let avgDY = 0;
  let numNeighbors = 0;

  for (let otherBoid of boids) {
    if (distance(boid, otherBoid) < visualRange) {
      avgDX += otherBoid.dx;
      avgDY += otherBoid.dy;
      numNeighbors += 1;
    }
  }

  if (numNeighbors) {
    avgDX = avgDX / numNeighbors;
    avgDY = avgDY / numNeighbors;

    boid.dx += (avgDX - boid.dx) * alignment;
    boid.dy += (avgDY - boid.dy) * alignment;
  }
}

// Speed will naturally vary in flocking behavior, but real animals can't go
// arbitrarily fast.
function limitSpeed(boid) {

  const speed = Math.sqrt(boid.dx * boid.dx + boid.dy * boid.dy);
  if (speed > speedLimit) {
    boid.dx = (boid.dx / speed) * speedLimit;
    boid.dy = (boid.dy / speed) * speedLimit;
  }
}

function generateUnmoddedMode(mode) {
  newMode = []
  for (let i= Math.floor(minNote/12); i <= Math.ceil(maxNote/12); i++) {
    newMode = newMode.concat(mode.map(x => x + i*12))
  }
  return newMode.filter(x => x >= minNote && x <= maxNote)
}

function labelAxis(ctx) {
  cleanMode = generateUnmoddedMode(mode)
  x = 0
  for (note of generateUnmoddedMode(mode)) {
    prevX = x
    x = width*(note - minNote)/(maxNote-minNote)
    ctx.beginPath()
    // Circle around the note names
    ctx.arc(x, 14, 13, 0, 3*Math.PI, false)
    ctx.fillStyle = DARK_COLOR
    ctx.fill()
    ctx.strokeStyle = BRIGHT_COLOR
    ctx.stroke()
    // Write note name
    ctx.font = "16px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(getNoteName(note), x, 20)
    // draw separator line
    ctx.strokeStyle = DARK_COLOR
    midX = (prevX + x) /2
    ctx.moveTo(midX, 0)
    ctx.lineTo(midX, height)
    ctx.stroke()
  }
}

const DRAW_TRAIL = false;

function drawBoid(ctx, boid) {
  const angle = Math.atan2(boid.dy, boid.dx);
  ctx.translate(boid.x, boid.y);
  ctx.rotate(angle);
  ctx.translate(-boid.x, -boid.y);
  ctx.fillStyle = shiftColor(DARK_COLOR, boid.shineTimer);
  ctx.strokeStyle = BRIGHT_COLOR;
  boid.shineTimer = Math.max(boid.shineTimer - 1, 0)
  ctx.beginPath();
  ctx.moveTo(boid.x, boid.y);
  ctx.lineTo(boid.x - 15, boid.y + 5);
  ctx.lineTo(boid.x - 15, boid.y - 5);
  ctx.lineTo(boid.x, boid.y);
  ctx.fill();
  ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (DRAW_TRAIL) {
    ctx.strokeStyle = "#558cf466";
    ctx.beginPath();
    ctx.moveTo(boid.history[0][0], boid.history[0][1]);
    for (const point of boid.history) {
      ctx.lineTo(point[0], point[1]);
    }
    ctx.stroke();
  }
}

function updateTone(boid) {
  if (yAxis > 0) {
    // TODO: more separation between notes?
    if (boid.gain.gain.value <= 0.0001 || boid.osc.state === "stopped") {
      boid.osc.frequency.value = calculateFrequency(boid.x)
      duration = calculateDuration(boid.y)
      if (boid.osc.state === "stopped") {
        boid.osc.start()
      }
      boid.gain.gain.rampTo(1, anticlick)
      rampDownHelper(boid, duration)
      boid.shineTimer = SHINE_CONSTANT
    }
  } else {
    if (boid.gain.gain.value <= 0.0001) {
      boid.gain.gain.rampTo(1, anticlick)
    }
    if (boid.osc.state === "stopped"){
      boid.osc.start()
    }
    newFrequency = calculateFrequency(boid.x)
    if (Math.abs(newFrequency - boid.osc.frequency.value) >= 0.001) {
      boid.shineTimer = SHINE_CONSTANT
      boid.osc.frequency.value = newFrequency
    }
    boid.osc.volume.rampTo(calculateVolume(boid.y), anticlick)
  }
}

function rampDownHelper(boid, duration) {
    rampDuration = anticlick
    rampStart = boid.gain.gain.now() + duration - anticlick

    if (yAxis == Y_PLUCK) {
        rampDuration = duration
        rampStart = boid.gain.gain.now() + anticlick
    }
    if (anticlick == 0.0) {
        boid.osc.stop('+'+duration)
    } else {
        boid.gain.gain.rampTo(0, rampDuration, rampStart)
    }
}

// Main animation loop
function animationLoop() {
  // Update each boid
  for (let boid of boids) {
    // Update the velocities according to each rule
    flyTowardsCenter(boid);
    avoidOthers(boid);
    matchVelocity(boid);
    keepWithinBounds(boid);
    limitSpeed(boid);

    // Update the position based on the current velocity
    boid.x += boid.dx;
    boid.y += boid.dy;
    boid.history.push([boid.x, boid.y])
    boid.history = boid.history.slice(-50);
  }

  // Clear the canvas and redraw all the boids in their current positions
  const ctx = document.getElementById("boids").getContext("2d");
  ctx.clearRect(0, 0, width, height);
  for (let boid of boids) {
    drawBoid(ctx, boid);
    updateTone(boid);
  }
  labelAxis(ctx);
  // Schedule the next frame
  animId = window.requestAnimationFrame(animationLoop);
}

function findRoundedValue(precise, array) {
  index = 0
  min = Number.MAX_VALUE
  for (i = 0; i < array.length; i++) {
    if (Math.abs(array[i] - precise) < min) {
      min = Math.abs(array[i] - precise)
      value = array[i]
    }
  }
  if (Math.abs(array[0] + 12 - precise) < min) {
    value = array[0] + 12
  }
  return value
}

function calculateFrequency(x) {
  pitchDiff = x * (maxNote - minNote) / width + minNote;
  if (mode.length > 0) {
    pitchDiff = Math.floor(pitchDiff/12)*12 + findRoundedValue(mod(pitchDiff, 12), mode)
  }
  return 440 * Math.pow(1.059463094359, pitchDiff)
}

function calculateVolume(x) {
  return x * (maxVolume - minVolume) / height + minVolume;
}

function calculateDuration(x) {
  return maxDurationAbsolute/Math.pow(durationDivisions, Math.round(x * maxSubdivisionPower/height));
}

async function start() {
  await Tone.start()
  if (boids.length > 0) {
    boids.forEach(boid => boid.gain.gain.rampTo(0, anticlick))
    boids.forEach(boid => boid.osc.start())
    window.cancelAnimationFrame(animId)
  }
  isPaused = false;
  // Make sure the canvas always fills the whole window
  window.addEventListener("resize", sizeCanvas, false);
  sizeCanvas();

  // Randomly distribute the boids to start
  initBoids();

  // Schedule the main animation loop
  animId = window.requestAnimationFrame(animationLoop);
};

isPaused = false
function pause() {
  if(isPaused) {
    return unpause()
  }
  boids.forEach(boid => boid.gain.gain.rampTo(0, anticlick))
  window.cancelAnimationFrame(animId)
  isPaused = true
}

function unpause() {
  animId = window.requestAnimationFrame(animationLoop)
  isPaused = false
}

function switchAxis(value) {
  yAxis = value
  boids.forEach(resetBoid)
  if(yAxis == Y_VOLUME) {
    document.getElementById('subdiv_control').hidden = true
  } else {
    document.getElementById('subdiv_control').hidden = false
  }
}

function setAnticlick(value) {
    if (value) {
        anticlick = ANTICLICK_BUFFER
        boids.forEach(resetBoid)
    } else {
        anticlick = 0.0
    }
}

function setSubdivision(value) {
    durationDivisions = value
    maxSubdivisionPower = Math.floor(Math.log(maxDurationAbsolute/minDurationAbsolute)/Math.log(durationDivisions))
}

function modeToPreset(preset) {
  if(preset === "custom") {
    document.getElementById('custommode_control').hidden = false
    mode = document.getElementById('custommode').value.split(',').map(x => parseFloat(x, 10))

  } else {
    document.getElementById('custommode_control').hidden = true
    mode = modes[preset]
  }
}

function customModeChange(value) {
  if (document.getElementById('modepicker').value === "custom") {
    modeToPreset("custom")
  }
}

function shiftColor(hex, lum) {
  // validate hex string
  hex = String(hex).replace(/[^0-9a-f]/gi, '');
  if (hex.length < 6) {
    hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  }
  lum = lum || 0;

  // convert to decimal and change luminosity
  var rgb = "#", c, i;
  for (i = 0; i < 3; i++) {
    c = parseInt(hex.substr(i*2,2), 16);
    c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
    rgb += ("00"+c).substr(c.length);
  }

  return rgb;
}

const names = ["A", "A♯", "B", "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯"]
// Num is "half steps from A"
function getNoteName(num) {
  noteNum = mod(num, 12)
  if (noteNum % 1 != 0) {
    if (noteNum % 1 == 0.5) {
      if (names[Math.floor(noteNum)].includes("♯")) {
        return names[Math.ceil(noteNum)] + "𝄳"
      }
      return names[Math.floor(noteNum)] + "𝄲"
    }
    return "?" //TODO?
  }
  return names[noteNum]
}
