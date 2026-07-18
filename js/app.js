let video;
let handPose;
let hands = [];

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
    },modelReady);
}

function modelReady() {
    console.log("Model ready!");
    handPose.detectStart(video, gotHands);
}

function gotHands(results) {
  hands = results;
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
  
  // landmarks for the ai with 21 points
  for (let hand of hands) {
    for (let point of hand.keypoints) {
      fill(0, 255, 0);
      noStroke();
      
      let x = map(point.x, 0, video.width, 0, width);
      let y = map(point.y, 0, video.height, 0, height);

    circle(x, y, 10);
    }    
}
}
// Keep the canvas in sync with the browser window.
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
