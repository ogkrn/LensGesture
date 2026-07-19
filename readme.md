# LensGesture
LensGesture is a browser-based computer vision project that uses hand tracking to apply image filters to a live webcam feed. The application detects hand landmarks in real time and displays a filtered image between the user's hands, allowing interaction without using a keyboard or mouse.

The project was built to explore hand pose estimation, real-time image processing, and gesture-based interaction using JavaScript and modern browser technologies.

## How it works
I used the library ml5 and it's handPose model tracks 21 landmarks per hand. The four corners of the floating frame are set directly from your index fingertips and thumbs, smoothed a bit frame to frame so it doesn't jitter around. That quad gets treated as a window into the live camera feed, warped to match its shape.
I ended up avoiding WEBGL for the warp since it introduced more overhead than it was worth for this project. Instead the quad is split into two triangles, and each one gets a standard 2D canvas affine transform matched against the corresponding triangle in the raw camera image. Two triangles stitched together get you most of the way to a true perspective warp, and it's noticeably lighter to run.
## Features

* Live webcam feed
* Real-time hand tracking
* Floating image rendered between both hands
* Five image filters

  * Normal
  * Grayscale
  * Cartoon
  * Edge Detection
  * Invert
* Runs entirely in the browser
* No backend required

## Gestures

Peace sign: next filter
Fist: previous filter
Open palm: reset back to the normal filter
OK sign: toggle the debug overlay on or off
Pinch and hold for about a second: freeze or unfreeze the frame.

Keyboard shortcuts exist too if you'd rather not use gestures: F for next filter, R to reset, U to toggle debug view, P to freeze.

## Technologies Used

* HTML
* CSS
* JavaScript
* p5.js
* ml5.js
* TensorFlow.js

## Project Structure

```text
LensGesture/
│
├── css/
│   ───style.css
├── js/
│   ───app.js
│
├── index.html
└── README.md
```
## Filters
Normal, Invert, B&W Dark, Matrix, Cool, and Vintage. All done through CSS filter strings applied to the canvas context, nothing pixel-level or GPU-based.
## Running it
Clone the repo and serve it with any static file server, something like npx serve works fine, or use a Live Server extension in your editor. It needs to run over localhost or HTTPS since browsers won't allow camera access from a plain file path.
Once it's running, open it in a browser, allow camera access, and hold both hands up in front of the camera.
## Limitations
Right now it needs both hands in frame at once to work at all, there's no single-hand fallback. At very extreme hand angles you can sometimes catch a faint seam line where the two warp triangles meet, that's just a side effect of the triangle approach rather than a full perspective transform. I've mostly tested this on a laptop webcam, haven't tried it on mobile yet.
## Future Improvements

Some features that can be added later include:

* Additional image filters
* Custom gesture mapping
* Snapshot capture
* Video recording
* Face tracking
* Background segmentation
* Mobile support

## License

This project is licensed under the MIT License.
