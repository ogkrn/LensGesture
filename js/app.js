let video;
let handPose;
let hands = [];
const FRAME_ASPECT_RATIO = 0.75;
const SMOOTHING = 0.3; // 0 = no movement (frozen), 1 = no smoothing (raw/instant)

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
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],

  // Index
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],

  // Middle
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],

  // Ring
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],

  // Pinky
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],

  // Palm
  [0, 17],
];

// --------------------
// Setup
// --------------------

function setup() {
  createCanvas(windowWidth, windowHeight);

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
// --------------------
// Frame
// --------------------

function updateFrame() {
  const sortedHands = getSortedHands();

  if (!sortedHands) return;

  const leftHand = sortedHands[0];
  const rightHand = sortedHands[1];

  // Raw target positions this frame (unsmoothed)
  const targetTopLeft = toCanvas(leftHand.keypoints[8]);
  const targetBottomLeft = toCanvas(leftHand.keypoints[4]);
  const targetTopRight = toCanvas(rightHand.keypoints[8]);
  const targetBottomRight = toCanvas(rightHand.keypoints[4]);

  if (!frameInitialized) {
    // First detection: snap directly, no smoothing
    frame.topLeft = targetTopLeft;
    frame.bottomLeft = targetBottomLeft;
    frame.topRight = targetTopRight;
    frame.bottomRight = targetBottomRight;
    frameInitialized = true;
    return;
  }

  // Every frame after: smooth each corner toward its new target
  frame.topLeft = smoothPoint(frame.topLeft, targetTopLeft);
  frame.bottomLeft = smoothPoint(frame.bottomLeft, targetBottomLeft);
  frame.topRight = smoothPoint(frame.topRight, targetTopRight);
  frame.bottomRight = smoothPoint(frame.bottomRight, targetBottomRight);
}

function drawFrame() {
  if (hands.length < 2) return;

  noFill();
  stroke(255, 255, 0);
  strokeWeight(3);

  beginShape();
  vertex(frame.topLeft.x, frame.topLeft.y);
  vertex(frame.topRight.x, frame.topRight.y);
  vertex(frame.bottomRight.x, frame.bottomRight.y);
  vertex(frame.bottomLeft.x, frame.bottomLeft.y);
  endShape(CLOSE);
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

      fill(255);
      textSize(12);
      text(i, point.x + 6, point.y - 6);
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

  drawFrame();

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
