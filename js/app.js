let video;

function setup() {
    createCanvas(windowWidth, windowHeight);

    // Start the webcam. The actual video will be drawn on the canvas.
    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();
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

    // Temporary debug information.
    fill(255);
    noStroke();

    textSize(24);
    text("GestureLens", 20, 40);

    textSize(18);
    text("FPS : " + floor(frameRate()), 20, 70);

    // Center guides for positioning objects during development.
    stroke(255);

    line(width / 2, 0, width / 2, height);
    line(0, height / 2, width, height / 2);
}

// Keep the canvas in sync with the browser window.
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}