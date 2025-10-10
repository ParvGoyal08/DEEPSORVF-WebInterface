# Interactive Vessel Tracking Web Interface

This Flask web application provides an interactive interface for viewing vessel tracking results with click-to-toggle AIS information display.

## Setup Instructions

### 1. Export Bounding Box Data

First, run the export script to process your video and generate the required JSON data:

```bash
python export_bbox_data.py --data_path ./clip-01/ --result_path ./result/
```

This will:
- Process the video using the existing DeepSORT pipeline
- Generate `result/result.mp4` (processed video)
- Generate `result/bbox_data.json` (bounding box data for each frame)

### 2. Install Flask (if not already installed)

```bash
pip install Flask
```

### 3. Run the Web Application

```bash
python app.py
```

The application will be available at: http://localhost:5000

## Features

- **HTML5 Video Player**: Play/pause/scrub through the processed video
- **Interactive Canvas Overlay**: Click on vessels to toggle AIS information display
- **Real-time Synchronization**: Canvas overlay syncs with video playback
- **Control Buttons**: Show/Hide all vessel information
- **Responsive Design**: Works on desktop and mobile devices

## File Structure

```
├── app.py                    # Flask server
├── export_bbox_data.py       # Video processing and JSON export
├── templates/
│   └── index.html           # Main web interface
├── static/
│   ├── app.js              # JavaScript interactivity
│   └── style.css           # Styling
└── result/
    ├── result.mp4          # Processed video (generated)
    └── bbox_data.json      # Bounding box data (generated)
```

## How It Works

1. **Export Phase**: `export_bbox_data.py` processes the video and exports:
   - Processed video with vessel tracking
   - JSON file containing bounding box coordinates and AIS data for each frame

2. **Web Interface**: The Flask app serves:
   - HTML5 video player showing the processed video
   - Canvas overlay for interactive elements
   - JavaScript that handles click events and drawing

3. **Interactivity**: 
   - Click on vessels to toggle AIS information display
   - Canvas overlay draws bounding boxes and info panels
   - All processing happens client-side for smooth performance

## Technical Details

- **No MJPEG Streaming**: Uses pre-recorded video for better performance
- **Client-side Interactivity**: All click handling and drawing in JavaScript
- **Coordinate Scaling**: Properly maps click coordinates between display and original video dimensions
- **Frame Synchronization**: Canvas updates based on video playback time

## Troubleshooting

- Ensure `result/result.mp4` and `result/bbox_data.json` exist before running the web app
- Check browser console for JavaScript errors
- Verify Flask server is running on port 5000
- Make sure video file path in HTML matches the generated video file
