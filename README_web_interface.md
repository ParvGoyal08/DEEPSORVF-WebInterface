<!-- source /mnt/c/users/parv/onedrive/desktop/ip/deep/.venv/bin/activate -->

# Interactive Vessel Tracking Web Interface

This Flask web application provides an interactive interface for reviewing vessel tracking results. It plays a processed video with an HTML5 player and draws a synchronized canvas overlay that lets you click any vessel to toggle its AIS information.

**Timezone Configuration**: The entire system is configured to use China Standard Time (Asia/Shanghai, UTC+8).

## What You Provide (Inputs)

- **Source video frames or clip directory**: Provided via `--data_path` to `export_bbox_data.py`.
- **Tracking outputs (auto-generated)**: The export script runs the DeepSORT-based pipeline to detect and track vessels.
- **Optional parameters**:
  - `--data_path`: Path to input frames or a directory containing the clip.
  - `--result_path`: Output directory for the processed video and JSON.
  - Additional model/config parameters are read from the existing tracking pipeline (see comments in `export_bbox_data.py`).

## What You Get (Outputs)

- `result/result.mp4`: The processed video with drawn boxes/tracks.
- `result/bbox_data.json`: Frame-by-frame structured data with detections, tracks, and AIS info used by the web interface.
- A local web UI at `http://localhost:5000` to interactively explore detections and AIS data.

## End-to-End Pipeline

1. Export Phase (Offline)
   - Run the export script to process the video and emit artifacts used by the web app.
   - Performs detection + tracking (DeepSORT) and writes a compact JSON for the UI.
   - Produces a playable processed video (`result.mp4`).

2. Serving Phase (Backend)
   - `app.py` starts a Flask server that serves the static assets and the two generated artifacts (`result.mp4`, `bbox_data.json`).
   - Timezone is fixed to Asia/Shanghai to keep timestamps consistent.

3. Client Phase (Frontend)
   - `templates/index.html` renders the HTML5 video and an overlapping `<canvas>`.
   - `static/app.js` fetches `bbox_data.json`, keeps it in memory, and draws frame-synchronized overlays.
   - User interactions (clicks) are handled client-side to show/hide AIS info panels per vessel.

## Setup Instructions

### 1) Export Bounding Box Data

Run the export script to process your video and generate the required artifacts:

```bash
python export_bbox_data.py --data_path ./clip-01/ --result_path ./result/
```

This will:
- Process the input video/frames with the existing DeepSORT pipeline.
- Generate `result/result.mp4` (processed video with visualized tracks).
- Generate `result/bbox_data.json` (frame-aligned metadata for the web overlay).

### 2) Install Dependencies

```bash
pip install -r requirements.txt
```

This installs Flask, pytz, and all required runtime dependencies.

### 3) Run the Web Application

```bash
python app.py
```

Open `http://localhost:5000` in your browser.

## Web Interface: How It Works

- **HTML5 Video Player**: Standard controls (play/pause/seek) mapped to overlay updates.
- **Canvas Overlay**: Draws boxes, track IDs, and optional AIS panels; re-renders when time updates.
- **Click-to-Toggle AIS**: Clicking a vessel’s box toggles its AIS info panel. Buttons allow show/hide all.
- **Responsive**: Scales layout; overlay coordinates map correctly to displayed video size.

### Interaction Flow

1. Browser loads `index.html` and `app.js`.
2. `app.js` fetches `result/bbox_data.json` and inspects video metadata to compute scaling.
3. On every `timeupdate`/animation frame, it computes the current frame index and renders the corresponding boxes.
4. On canvas click, it converts click coordinates → video coordinates → runs hit-testing against current-frame boxes → toggles AIS panel state.

## Data Model (`bbox_data.json`)

`bbox_data.json` is a list or dictionary keyed by frame index/time, containing detections/tracks and optional AIS info per vessel. A typical record looks like:

```json
{
  "video": { "width": 1920, "height": 1080, "fps": 30 },
  "frames": [
    {
      "frame_index": 0,
      "time_s": 0.0,
      "detections": [
        {
          "track_id": 12,
          "bbox": [x_min, y_min, x_max, y_max],
          "confidence": 0.92,
          "class": "vessel",
          "ais": {
            "mmsi": "413123456",
            "name": "XIANG YUN",
            "type": "Cargo",
            "speed_kn": 12.3,
            "course_deg": 85.0,
            "timestamp": "2025-01-01T12:00:00+08:00"
          }
        }
      ]
    }
  ]
}
```

Notes:
- `video.width`/`height` are used for scaling between original video and the displayed canvas.
- `fps` and `time_s` are used to map playback time to frame index.
- `bbox` uses pixel coordinates in the original video space.
- `ais` fields are optional and only shown if present.

## File Structure

```
├── app.py                    # Flask server (serves video + JSON + frontend)
├── export_bbox_data.py       # Video processing and JSON export (DeepSORT pipeline)
├── templates/
│   └── index.html           # Main web interface
├── static/
│   ├── app.js              # Canvas rendering + interaction logic
│   └── style.css           # Styling for layout and AIS panels
└── result/
    ├── result.mp4          # Processed video (generated)
    └── bbox_data.json      # Frame-by-frame metadata (generated)
```

## Technical Details and Guarantees

- No streaming server: Uses pre-rendered `result.mp4` for smoother playback.
- All interactivity is client-side; no server-side per-frame logic.
- Coordinate scaling preserves hit accuracy across different display sizes and DPR.
- Time synchronization relies on HTML5 video events; frame index computed from `currentTime` and `fps`.

## Performance Tips

- Prefer H.264-encoded `result.mp4` for maximum browser compatibility.
- Keep `bbox_data.json` reasonably sized; consider down-sampling dense metadata if very large.
- Use a release build of your browser for smoother canvas performance.

## Troubleshooting

- Ensure `result/result.mp4` and `result/bbox_data.json` exist before starting the server.
- Check the browser console for JavaScript errors and network requests for 404s.
- Verify Flask is listening on port 5000 and nothing else conflicts with it.
- Confirm the paths in `index.html`/`app.py` match your `result/` location.

## FAQ

- Can I use a different timezone?
  - Yes. Update the timezone handling in `app.py` and any timestamp generation in the export.
- Can I add custom fields to AIS?
  - Yes. Add them to the JSON and update `static/app.js` to render them in the info panel.
- Can I skip AIS entirely?
  - Yes. The UI gracefully handles records without `ais`.
