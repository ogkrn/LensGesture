let video;
let handPose;
let hands = [];

const SMOOTHING = 0.3; // 0 = frozen, 1 = no smoothing (raw/instant)
const SHOW_LANDMARK_LABELS = false; // set true only when debugging keypoint indices

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
  [0, 1], [1, 2], [2, 3], [3, 4],        // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // Index
  [5, 9], [9, 10], [10, 11], [11, 12],   // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [0, 17],                               // Palm
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
function drawTriangleWarp(sourcePts, destPts) {
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

  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(video.elt, 0, 0);

  ctx.restore();
}

function drawWarpedImage() {
  if (hands.length < 2) return;
  if (video.width === 0 || video.height === 0) return;

  const sTopLeft = toSourcePoint(frame.topLeft);
  const sTopRight = toSourcePoint(frame.topRight);
  const sBottomLeft = toSourcePoint(frame.bottomLeft);
  const sBottomRight = toSourcePoint(frame.bottomRight);

  // Triangle 1: topLeft, topRight, bottomLeft
  drawTriangleWarp(
    [sTopLeft, sTopRight, sBottomLeft],
    [frame.topLeft, frame.topRight, frame.bottomLeft],
  );

  // Triangle 2: topRight, bottomRight, bottomLeft
  drawTriangleWarp(
    [sTopRight, sBottomRight, sBottomLeft],
    [frame.topRight, frame.bottomRight, frame.bottomLeft],
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

function drawUI() {
  fill(255);
  noStroke();

  textSize(24);
  text("GestureLens", 20, 40);

  textSize(18);
  text("FPS : " + floor(frameRate()), 20, 70);
  text("Hands : " + hands.length, 20, 100);
  text("Canvas : " + width + " × " + height, 20, 130);
  text("Video : " + video.width + " × " + video.height, 20, 160);

  stroke(255);
  line(width / 2, 0, width / 2, height);
  line(0, height / 2, width, height / 2);
}

// --------------------
// Draw
// --------------------

function draw() {
  background(20);

  drawCamera();

  drawUI();

  updateFrame();

  drawWarpedImage();

  drawGripPoints();

  drawSkeleton();

  drawLandmarks();
}

// --------------------
// Resize
// --------------------

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}