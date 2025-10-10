## Interactive AIS/NO AIS Toggle – Implementation Notes

### Overview
This change adds clickable bounding boxes in the existing OpenCV window to toggle per-target information panels. By default, info panels are hidden; clicking a box toggles visibility for that track ID. The video continues to render and save as before.

### Files Updated

1) `utils/draw.py`
- Added per-ID tracking and visibility control.
- Exposed last drawn boxes for hit-testing.
- Conditional rendering of AIS/NO AIS panels based on per-ID visibility.

Key updates:
- New fields/state on class `DRAW`:
  - `self.visibility_by_id: Dict[int, bool]` – visibility map per track ID (False initially).
  - `self.last_boxes: List[{'id': int, 'box': (x1,y1,x2,y2), 'has_ais': bool}]` – boxes from latest frame for hit-testing.
  - `self.verbose: bool` – toggle debug prints.
- New public methods:
  - `set_verbose(verbose: bool)` – enable/disable debug logs.
  - `set_visibility(track_id: int, visible: bool)` – set panel visibility for an ID.
  - `toggle_visibility(track_id: int)` – flip visibility for an ID.
  - `get_last_boxes() -> List[dict]` – read-only copy of last boxes for click hit-testing.
- Data assembly:
  - Per detection row now includes `id` and is cached into `self.last_boxes` after `filter_inf`.
- Rendering path:
  - A new internal method `_draw_with_visibility(...)` renders panels only if `visibility_by_id[id]` is True. AIS panels show MMSI/SOG/COG/LAT/LON; NO AIS panels show a label. Bounding boxes always render.
- Logging:
  - Prints when showing/hiding panels and during draw decisions when `verbose` is True.

API surface changes (non-breaking unless external code relied on exact internals):
- `DRAW.draw_traj(...)` unchanged signature; behavior now consults visibility map.
- Additional helper methods are optional to use (consumed by `main.py`).

2) `main.py`
- Kept the same window name (`name = 'demo'`).
- Registered a mouse callback on that window to toggle panel visibility per clicked box.
- Introduced scaling factors to map clicks on the resized display back to original frame coordinates for accurate hit-testing.

Key updates:
- At startup of the loop:
  - `scale_x`, `scale_y` initialized; a `_on_mouse` function is bound via `cv2.setMouseCallback(name, _on_mouse)`.
- In the display section:
  - After resizing to `show_size`, compute:
    - `scale_x = result.shape[1] / float(im.shape[1])`
    - `scale_y = result.shape[0] / float(im.shape[0])`
- Mouse callback `_on_mouse(event, x, y, ...)`:
  - On `EVENT_LBUTTONDOWN`, map click: `ox = int(x / scale_x)`, `oy = int(y / scale_y)`.
  - Read `boxes = DRA.get_last_boxes()` (list of dicts with `id` and `box`).
  - Hit-test: choose the smallest-area box that contains `(ox, oy)` to avoid stacked-box ambiguity.
  - Toggle: `DRA.toggle_visibility(hit['id'])`.
  - Console logs for debugging (clicks, hits, ESC to exit).
- Small fix:
  - Use `arg.camera_para` when calling `AIS.process(...)`.



3) Pandas 2.0 compatibility fixes
- Replaced deprecated `DataFrame.append(...)` across modules with `pd.concat([...], ignore_index=True)` or equivalently building frames then concatenating.

Updated files/locations:
- `utils/AIS_utils.py`:
  - In `transform(...)`: append to `AIS_visCurrent`.
  - In `data_pred(...)`: append to `AIS_cur` in multiple branches.
  - In `data_tran(...)`: append `AIS_vis_cur` into `AIS_vis`.
- `utils/FUS_utils.py`:
  - In `save_data(...)`: appends to `mat_list`, `mat_cur`, and `bin_cur` replaced with `pd.concat`.
- `utils/VIS_utils.py`:
  - In `track(...)`: append to `Vis_tra_cur_3` replaced with `pd.concat`.
  - In `update_tra(...)`: append to `Vis_tra_cur` and `Vis_tra` replaced with `pd.concat`.
  - In `feedCap(...)`: building `Anti_occlusion_traj` uses `pd.concat`.
- `utils/draw.py`:
  - Internal frame assembly now uses `pd.concat` when adding rows.

### Click-to-Toggle Algorithm

1) Drawing phase (`utils/draw.py`):
- For each visible track at the current timestamp, assemble a row with coordinates, AIS fields, and the `id`.
- After layout (`filter_inf`), cache `self.last_boxes` as a list of dicts with `id` and `(x1,y1,x2,y2)` box.
- Always draw the bounding box outline.
- If `visibility_by_id[id]` is True:
  - If AIS data exists: draw AIS info panel with MMSI/SOG/COG/LAT/LON and a connector line.
  - Else: draw a NO AIS label panel and a connector line.
- If False: draw nothing besides the box; the panel remains hidden.

2) Hit-testing and toggling (`main.py`):
- The displayed frame is resized for UI; clicks occur in display coordinates. Maintain `scale_x`/`scale_y` each frame to map display coords back to original frame coords.
- On click:
  - Map `(x,y)` -> `(ox, oy)` using the scale factors.
  - Iterate cached `last_boxes` to find all boxes containing `(ox, oy)`.
  - Select the smallest-area containing box to reduce ambiguity for overlapping boxes.
  - Toggle the associated `id` via `DRA.toggle_visibility(id)`; the next draw will reflect the new visibility.

### Runtime Behavior
- Initial state: all panels hidden (`visibility_by_id` defaults to False), boxes visible.
- Clicking a box toggles its info panel on/off without altering tracking or fusion logic.
- ESC exits; closing the window also exits.


### Troubleshooting
- Pandas 2.0: All `DataFrame.append` removed; if a new path still uses it, replace with `pd.concat([...], ignore_index=True)`.
- NumPy dtype: Ensure `np.float32` is used for feature arrays in DeepSort.
- Clicks not registering:
  - Verify the window name is `demo` and the callback is set before the loop.
  - Confirm `scale_x/scale_y` are positive and updated after resizing.
  - Ensure boxes exist: `DRA.get_last_boxes()` returns non-empty for frames containing detections.


