function setup(){
    createCanvas(windowWidth, windowHeight);
}
function draw(){
    background(20);
    fill(200, 0 ,200);
    textSize(24);
    text("GestureLens", 330, 50);
    textSize(18);
    text("FPS: " + floor(frameRate()), 30, 75);

    stroke(255);

    line(width/2,0 ,width/2 , height);

    line(
    0,
    height / 2,
    width,
    height / 2
    );
}
function windowResized() {

    resizeCanvas(windowWidth, windowHeight);

}