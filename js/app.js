let video;
let handPose;
let hands = [];

// Skeleton connections

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

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Start the webcam. The actual video will be drawn on the canvas.
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
  console.log("Model ready!");
  handPose.detectStart(video, gotHands);
}

function gotHands(results) {
  hands = results;
}

function drawSkeleton() {
  stroke(0, 255, 0);

  strokeWeight(2);

  for (let hand of hands) {
    for (let connection of connections) {
      let start = hand.keypoints[connection[0]];
      let end = hand.keypoints[connection[1]];

      let x1 = map(start.x, 0, video.width, 0, width);
      let y1 = map(start.y, 0, video.height, 0, height);

      let x2 = map(end.x, 0, video.width, 0, width);
      let y2 = map(end.y, 0, video.height, 0, height);

      line(x1, y1, x2, y2);
    }
  }
}

function draw() {
  background(20);

  // Mirror the camera so it behaves like a selfie view.
  push();

  translate(width, 0);
  scale(-1, 1);

  image(video, 0, 0, width, height);

  pop();

  // Slightly darken the feed so overlays remain easy to read.
  fill(0, 70);
  rect(0, 0, width, height);
  noStroke();
  // Temporary debug information.
  fill(255);
  noStroke();

  textSize(24);
  text("GestureLens", 20, 40);

  textSize(18);
  text("FPS : " + floor(frameRate()), 20, 70);
  text("Hands : " + hands.length, 30, 100);
  text("Canvas: " + width + " x " + height, 30, 130);
  text("Video: " + video.width + " x " + video.height, 30, 160);

  // Center guides for positioning objects during development.
  stroke(255);

  line(width / 2, 0, width / 2, height);
  line(0, height / 2, width, height / 2);

  drawSkeleton();

  // landmarks for the ai with 21 points
  for (let hand of hands) {
    for (let i = 0; i < hand.keypoints.length; i++) {
      let point = hand.keypoints[i];

      let x = map(point.x, 0, video.width, 0, width);
      let y = map(point.y, 0, video.height, 0, height);

      if (i == 4 || i == 8 || i == 12 || i == 16 || i == 20) {
        fill(255, 0, 0);
      } else {
        fill(0, 255, 0);
      }

      noStroke();

      if (i == 0) {
        circle(x, y, 24);
      } else {
        circle(x, y, 10);
      }
      fill(255);

      textSize(12);

      text(i, x + 6, y - 6);
    }
  }
}
// Keep the canvas in sync with the browser window.
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
