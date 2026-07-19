let video;
let handPose;
let hands = [];
let leftGesture = "None";
let rightGesture = "None";
let previousLeftGesture = "None";
let previousRightGesture = "None";

let leftGestureCandidate = "None";
let leftGestureStableFrames = 0;
let rightGestureCandidate = "None";
let rightGestureStableFrames = 0;

const GESTURE_STABILITY_FRAMES = 6; // consecutive frames a gesture must hold before it's accepted
let currentFilterIndex = 0; // Index of the current filter
let debugUIVisible = true;

let isFrozen = false;
let frozenFrameBuffer;
let pinchHoldFrames = 0;
const PINCH_HOLD_TRIGGER_FRAMES = 45;

let frameAlpha = 0; // 0-255, smoothly follows whether both hands are present
let filterFlashAmount = 0; // 0-255, spikes on filter change then decays
let gesturePulses = []; // active pulse animations, one per triggered gesture

const SMOOTHING = 0.3; // 0 = frozen, 1 = no smoothing (raw/instant)
const SHOW_LANDMARK_LABELS = false; // set true only when debugging keypoint indices
const filters = [
  { name: "Normal", css: "none" },
  { name: "Invert", css: "invert(100%)" },
  { name: "B&W Dark", css: "grayscale(100%) contrast(140%) brightness(80%)" },
  {
    name: "Matrix",
    css: "sepia(100%) hue-rotate(90deg) saturate(400%) brightness(80%)",
  },
  { name: "Cool", css: "hue-rotate(180deg) saturate(140%)" },
  {
    name: "Vintage",
    css: "sepia(50%) contrast(90%) brightness(105%) saturate(80%)",
  },
];

let frame = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 0, y: 0 },
  bottomLeft: { x: 0, y: 0 },
  bottomRight: { x: 0, y: 0 },
};
let frameInitialized = false;

// --------------------
// Skeleton Connections
// --------------------

const connections = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4], // Thumb
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8], // Index
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12], // Middle
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16], // Ring
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20], // Pinky
  [0, 17], // Palm
];

// --------------------
// Setup
// --------------------

function setup() {
  pixelDensity(1); // keeps drawingContext math 1:1 with canvas coordinates

  createCanvas(windowWidth, windowHeight); // plain 2D, no WEBGL

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  frozenFrameBuffer = createGraphics(video.width, video.height);

  handPose = ml5.handPose(
    {
      maxHands: 2,
      flipped: true,
    },
    modelReady,
  );
}

function modelReady() {
  console.log("Model Ready!");
  handPose.detectStart(video, gotHands);
}

function gotHands(results) {
  hands = results;
}

// --------------------
// Helpers
// --------------------

function getSortedHands() {
  if (hands.length < 2) return null;
  return [...hands].sort((a, b) => a.keypoints[0].x - b.keypoints[0].x);
}

function getGripPoint(hand) {
  const thumb = hand.keypoints[4];
  const index = hand.keypoints[8];
  return {
    x: (thumb.x + index.x) / 2,
    y: (thumb.y + index.y) / 2,
  };
}
function drawPanel(x, y, w, h, radius = 10) {
  noStroke();
  fill(0, 0, 0, 130);
  rect(x, y, w, h, radius);
}
function dist2D(a, b) {
  return dist(a.x, a.y, b.x, b.y);
}

// Is a fingertip "extended" (far from palm center) vs "curled" (close to palm)?
function isFingerExtended(hand, tipIndex, pipIndex) {
  const wrist = hand.keypoints[0];
  const tip = hand.keypoints[tipIndex];
  const pip = hand.keypoints[pipIndex];
  return dist2D(wrist, tip) > dist2D(wrist, pip);
}
function spawnGesturePulse(hand) {
  const wrist = toCanvas(hand.keypoints[0]);
  gesturePulses.push({ x: wrist.x, y: wrist.y, radius: 10, alpha: 200 });
}
function classifyGesture(hand) {
  const indexExt = isFingerExtended(hand, 8, 6);
  const middleExt = isFingerExtended(hand, 12, 10);
  const ringExt = isFingerExtended(hand, 16, 14);
  const pinkyExt = isFingerExtended(hand, 20, 18);

  const thumbTip = hand.keypoints[4];
  const indexTip = hand.keypoints[8];
  const pinchDist = dist2D(thumbTip, indexTip);

  const handSize = dist2D(hand.keypoints[0], hand.keypoints[9]); // wrist to middle knuckle, for scale
  const pinchThreshold = handSize * 0.3; // slightly tighter, so casual closeness doesn't misfire

  const isPinching = pinchDist < pinchThreshold;

  const allCurled = !indexExt && !middleExt && !ringExt && !pinkyExt;
  const allExtended = indexExt && middleExt && ringExt && pinkyExt;

  // Checked FIRST, unconditionally: a natural fist often brings the thumb
  // close enough to satisfy the pinch-distance test too. Without this
  // priority, closing your hand into a fist would misfire as Pinch.
  if (allCurled) {
    return "Fist";
  }

  // Reaching here means NOT a full fist, so this really is index+thumb
  // pinching while the other three fingers relax inward — not a fist.
  if (isPinching && !middleExt && !ringExt && !pinkyExt) {
    return "Pinch";
  }

  if (isPinching && middleExt && ringExt && pinkyExt) {
    return "OK";
  }

  if (indexExt && middleExt && !ringExt && !pinkyExt) {
    return "Peace";
  }

  if (allExtended) {
    return "OpenPalm";
  }

  return "None";
}
// Only accepts a gesture as "real" once it's held steady for several
// frames in a row — filters out single-frame flicker from jittery keypoints.
function stabilizeGesture(rawGesture, confirmed, candidate, stableFrames) {
  if (rawGesture === candidate.value) {
    stableFrames.value++;
  } else {
    candidate.value = rawGesture;
    stableFrames.value = 1;
  }

  if (stableFrames.value >= GESTURE_STABILITY_FRAMES) {
    return candidate.value;
  }

  return confirmed; // not stable yet — keep the last confirmed gesture
}
function updateGestures() {
  previousLeftGesture = leftGesture;
  previousRightGesture = rightGesture;

  const sortedHands = getSortedHands();
  const rawLeft = sortedHands ? classifyGesture(sortedHands[0]) : "None";
  const rawRight = sortedHands ? classifyGesture(sortedHands[1]) : "None";

  const leftCandidateRef = { value: leftGestureCandidate };
  const leftStableRef = { value: leftGestureStableFrames };
  leftGesture = stabilizeGesture(
    rawLeft,
    leftGesture,
    leftCandidateRef,
    leftStableRef,
  );
  leftGestureCandidate = leftCandidateRef.value;
  leftGestureStableFrames = leftStableRef.value;

  const rightCandidateRef = { value: rightGestureCandidate };
  const rightStableRef = { value: rightGestureStableFrames };
  rightGesture = stabilizeGesture(
    rawRight,
    rightGesture,
    rightCandidateRef,
    rightStableRef,
  );
  rightGestureCandidate = rightCandidateRef.value;
  rightGestureStableFrames = rightStableRef.value;

  handleGestureTriggers();
}
function drawGesturePulses() {
  noFill();
  for (let i = gesturePulses.length - 1; i >= 0; i--) {
    const p = gesturePulses[i];

    stroke(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2], p.alpha);
    strokeWeight(2);
    circle(p.x, p.y, p.radius);

    p.radius += 4;
    p.alpha -= 8;

    if (p.alpha <= 0) {
      gesturePulses.splice(i, 1);
    }
  }
}

// Fires an action once, on the frame a gesture first appears — not every
// frame it's held. Either hand can trigger; whichever changes first wins.
function handleGestureTriggers() {
  const leftJustChanged = leftGesture !== previousLeftGesture;
  const rightJustChanged = rightGesture !== previousRightGesture;
  const sortedHands = getSortedHands();

  if (leftJustChanged && leftGesture === "Peace") {
    nextFilter();
    if (sortedHands) spawnGesturePulse(sortedHands[0]);
  } else if (rightJustChanged && rightGesture === "Peace") {
    nextFilter();
    if (sortedHands) spawnGesturePulse(sortedHands[1]);
  }

  if (leftJustChanged && leftGesture === "Fist") {
    previousFilter();
    if (sortedHands) spawnGesturePulse(sortedHands[0]);
  } else if (rightJustChanged && rightGesture === "Fist") {
    previousFilter();
    if (sortedHands) spawnGesturePulse(sortedHands[1]);
  }

  if (leftJustChanged && leftGesture === "OpenPalm") {
    resetFilter();
    if (sortedHands) spawnGesturePulse(sortedHands[0]);
  } else if (rightJustChanged && rightGesture === "OpenPalm") {
    resetFilter();
    if (sortedHands) spawnGesturePulse(sortedHands[1]);
  }

  if (leftJustChanged && leftGesture === "OK") {
    toggleDebugUI();
    if (sortedHands) spawnGesturePulse(sortedHands[0]);
  } else if (rightJustChanged && rightGesture === "OK") {
    toggleDebugUI();
    if (sortedHands) spawnGesturePulse(sortedHands[1]);
  }

  const eitherPinching = leftGesture === "Pinch" || rightGesture === "Pinch";

  if (eitherPinching) {
    pinchHoldFrames++;
    if (pinchHoldFrames === PINCH_HOLD_TRIGGER_FRAMES) {
      toggleFreeze();
      if (sortedHands) {
        spawnGesturePulse(sortedHands[0]);
        spawnGesturePulse(sortedHands[1]);
      }
    }
  } else {
    pinchHoldFrames = 0;
  }
}

function toCanvas(point) {
  return {
    x: map(point.x, 0, video.width, 0, width),
    y: map(point.y, 0, video.height, 0, height),
  };
}

function smoothPoint(current, target) {
  return {
    x: lerp(current.x, target.x, SMOOTHING),
    y: lerp(current.y, target.y, SMOOTHING),
  };
}

// Converts a screen-space (canvas) point back into raw video-pixel space.
function toVideoSpace(canvasPoint) {
  return {
    x: map(canvasPoint.x, 0, width, 0, video.width),
    y: map(canvasPoint.y, 0, height, 0, video.height),
  };
}

// Converts a screen-space frame corner into the matching point in the
// UNMIRRORED raw video feed (since we'll draw from video.elt directly,
// which isn't flipped, unlike what's shown on screen).
function toSourcePoint(canvasPoint) {
  const vp = toVideoSpace(canvasPoint);
  return {
    x: video.width - vp.x,
    y: vp.y,
  };
}

// --------------------
// Frame
// --------------------

function updateFrame() {
  const sortedHands = getSortedHands();

  const targetAlpha = sortedHands ? 255 : 0;
  frameAlpha = lerp(frameAlpha, targetAlpha, 0.15);

  if (!sortedHands) return;

  const leftHand = sortedHands[0];
  const rightHand = sortedHands[1];

  const targetTopLeft = toCanvas(leftHand.keypoints[8]);
  const targetBottomLeft = toCanvas(leftHand.keypoints[4]);
  const targetTopRight = toCanvas(rightHand.keypoints[8]);
  const targetBottomRight = toCanvas(rightHand.keypoints[4]);

  if (!frameInitialized) {
    frame.topLeft = targetTopLeft;
    frame.bottomLeft = targetBottomLeft;
    frame.topRight = targetTopRight;
    frame.bottomRight = targetBottomRight;
    frameInitialized = true;
    return;
  }

  frame.topLeft = smoothPoint(frame.topLeft, targetTopLeft);
  frame.bottomLeft = smoothPoint(frame.bottomLeft, targetBottomLeft);
  frame.topRight = smoothPoint(frame.topRight, targetTopRight);
  frame.bottomRight = smoothPoint(frame.bottomRight, targetBottomRight);
}

// --------------------
// Triangle-based perspective-ish warp (2D canvas, no WEBGL)
// --------------------

// Solves the affine matrix that maps source triangle (s0,s1,s2)
// onto destination triangle (d0,d1,d2).
function computeAffine(s0, s1, s2, d0, d1, d2) {
  const denom =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);

  if (denom === 0) return null; // degenerate triangle, skip

  const a =
    (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) /
    denom;
  const b =
    (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) /
    denom;
  const c =
    (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) /
    denom;
  const d =
    (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) /
    denom;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denom;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denom;

  return { a, b, c, d, e, f };
}

// Clips to one destination triangle, applies the matching affine transform,
// then stamps the whole video frame through it — only the clipped triangle
// area actually shows.
function drawTriangleWarp(sourcePts, destPts, sourceElement) {
  const [s0, s1, s2] = sourcePts;
  const [d0, d1, d2] = destPts;

  const m = computeAffine(s0, s1, s2, d0, d1, d2);
  if (!m) return;

  const ctx = drawingContext; // p5's underlying native 2D context

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  ctx.filter = filters[currentFilterIndex].css; // apply the active filter to just this warped triangle
  ctx.globalAlpha = frameAlpha / 255;

  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(sourceElement, 0, 0);

  ctx.restore();
}

function drawWarpedImage() {
  if (frameAlpha < 1) return; // fully faded out, nothing to draw
  if (video.width === 0 || video.height === 0) return;

  const sourceElement = isFrozen ? frozenFrameBuffer.elt : video.elt;

  const sTopLeft = toSourcePoint(frame.topLeft);
  const sTopRight = toSourcePoint(frame.topRight);
  const sBottomLeft = toSourcePoint(frame.bottomLeft);
  const sBottomRight = toSourcePoint(frame.bottomRight);

  // Triangle 1: topLeft, topRight, bottomLeft
  drawTriangleWarp(
    [sTopLeft, sTopRight, sBottomLeft],
    [frame.topLeft, frame.topRight, frame.bottomLeft],
    sourceElement,
  );

  // Triangle 2: topRight, bottomRight, bottomLeft
  drawTriangleWarp(
    [sTopRight, sBottomRight, sBottomLeft],
    [frame.topRight, frame.bottomRight, frame.bottomLeft],
    sourceElement,
  );
}

function drawGripPoints() {
  const sortedHands = getSortedHands();
  if (!sortedHands) return;

  const left = toCanvas(getGripPoint(sortedHands[0]));
  const right = toCanvas(getGripPoint(sortedHands[1]));

  noStroke();
  fill(0, 200, 255);
  circle(left.x, left.y, 16);
  circle(right.x, right.y, 16);
}
function drawFrameCornerGlow() {
  if (frameAlpha < 1) return;

  const corners = [frame.topLeft, frame.topRight, frame.bottomLeft, frame.bottomRight];
  const outerAlpha = map(frameAlpha, 0, 255, 0, 60);
  const innerAlpha = map(frameAlpha, 0, 255, 0, 200);

  noStroke();
  for (const corner of corners) {
    fill(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2], outerAlpha);
    circle(corner.x, corner.y, 34);
    fill(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2], innerAlpha);
    circle(corner.x, corner.y, 14);
  }
}
// --------------------
// Skeleton
// --------------------

function drawSkeleton() {
  stroke(0, 255, 0);
  strokeWeight(2);

  for (let hand of hands) {
    for (let connection of connections) {
      const start = toCanvas(hand.keypoints[connection[0]]);
      const end = toCanvas(hand.keypoints[connection[1]]);
      line(start.x, start.y, end.x, end.y);
    }
  }
}

// --------------------
// Landmarks
// --------------------

function drawLandmarks() {
  for (let hand of hands) {
    for (let i = 0; i < hand.keypoints.length; i++) {
      const point = toCanvas(hand.keypoints[i]);

      if (i == 4 || i == 8 || i == 12 || i == 16 || i == 20) {
        fill(255, 0, 0);
      } else {
        fill(0, 255, 0);
      }
      noStroke();

      if (i == 0) {
        circle(point.x, point.y, 24);
      } else {
        circle(point.x, point.y, 10);
      }

      if (SHOW_LANDMARK_LABELS) {
        fill(255);
        textSize(12);
        text(i, point.x + 6, point.y - 6);
      }
    }
  }
}

// --------------------
// Camera
// --------------------

function drawCamera() {
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();

  noStroke();
  fill(0, 70);
  rect(0, 0, width, height);
}

// --------------------
// Debug UI
// --------------------

const ACCENT_COLOR = [0, 220, 255]; // single accent color used across the HUD

function drawUI() {
  // --- Top-left: small dev/status panel ---
  drawPanel(16, 16, 210, 90);
  fill(255);
  noStroke();
  textSize(16);
  text("GestureLens", 30, 40);
  textSize(12);
  fill(200);
  text("FPS " + floor(frameRate()) + "  ·  Hands " + hands.length, 30, 62);
  text(video.width + "×" + video.height + " → " + width + "×" + height, 30, 80);
  text(
    isFrozen ? "Frozen" : (leftGesture !== "None" || rightGesture !== "None"
      ? leftGesture + " / " + rightGesture
      : "No gesture"),
    30,
    98,
  );

  

  // --- Bottom-center: active filter name, the one thing users actually care about ---
  const filterLabel = filters[currentFilterIndex].name;
  textSize(20);
  const labelWidth = textWidth(filterLabel) + 40;
  drawPanel(width / 2 - labelWidth / 2, height - 60, labelWidth, 40, 20);
  fill(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2]);
  textAlign(CENTER, CENTER);
  text(filterLabel, width / 2, height - 40);
  textAlign(LEFT, BASELINE); // reset for other text calls

  // --- Top-right: freeze indicator, only shown when active ---
  if (isFrozen) {
    drawPanel(width - 130, 16, 114, 40, 20);
    fill(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2]);
    noStroke();
    circle(width - 110, 36, 14);
    fill(255);
    textSize(14);
    text("Frozen", width - 95, 41);
  }
}

// --------------------
// Draw
// --------------------

function draw() {
  background(20);

  drawCamera();

  updateFrame();

  updateGestures();

  drawWarpedImage();

  drawFrameCornerGlow();

  drawGesturePulses();

  drawFilterFlash();

  drawUI();

  if (debugUIVisible) {
    drawGripPoints();
    drawSkeleton();
    drawLandmarks();
  }
}
// --------------------
// Resize
// --------------------
function triggerFilterFlash() {
  filterFlashAmount = 255;
}
function drawFilterFlash() {
  if (filterFlashAmount <= 0) return;

  noStroke();
  fill(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2], filterFlashAmount * 0.15);
  rect(0, 0, width, height);

  filterFlashAmount = lerp(filterFlashAmount, 0, 0.2);
  if (filterFlashAmount < 1) filterFlashAmount = 0;
}
function nextFilter() {
  currentFilterIndex = (currentFilterIndex + 1) % filters.length;
  triggerFilterFlash();
}

function previousFilter() {
  currentFilterIndex =
    (currentFilterIndex - 1 + filters.length) % filters.length;
  triggerFilterFlash();
}
function resetFilter() {
  currentFilterIndex = 0;
  triggerFilterFlash();
}

function toggleDebugUI() {
  debugUIVisible = !debugUIVisible;
}
function toggleFreeze() {
  if (!isFrozen) {
    frozenFrameBuffer.image(
      video,
      0,
      0,
      frozenFrameBuffer.width,
      frozenFrameBuffer.height,
    );
    isFrozen = true;
  } else {
    isFrozen = false;
  }
}
function keyPressed() {
  if (key === "f" || key === "F") {
    nextFilter();
  }
  if (key === "r" || key === "R") {
    resetFilter();
  }
  if (key === "u" || key === "U") {
    toggleDebugUI();
  }
  if (key === "p" || key === "P") {
    toggleFreeze();
  }
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
