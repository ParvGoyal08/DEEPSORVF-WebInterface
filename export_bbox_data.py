import os, time, imutils, cv2, argparse
import pandas as pd
import numpy as np
import json
from utils.file_read import read_all, ais_initial, update_time, time2stamp

from utils.VIS_utils import VISPRO
from utils.AIS_utils import AISPRO
from utils.FUS_utils import FUSPRO
from utils.gen_result import gen_result
import imageio
from utils.draw import DRAW


def export_bbox_data(arg):
    """Export bounding box data to JSON for web interface"""
    
    # Initialize AIS data
    ais_file, timestamp0, time0 = ais_initial(arg.ais_path, arg.initial_time)
    Time = arg.initial_time.copy()
    
    # Initialize video capture and processing components
    cap = cv2.VideoCapture(arg.video_path)
    im_shape = [cap.get(3), cap.get(4)]
    max_dis = min(im_shape)//2
    fps = int(cap.get(5))
    t = int(1000/fps)
    
    AIS = AISPRO(arg.ais_path, ais_file, im_shape, t)
    VIS = VISPRO(arg.anti, arg.anti_rate, t)
    FUS = FUSPRO(max_dis, im_shape, t)
    DRA = DRAW(im_shape, t)
    
    show_size = 500
    videoWriter = None
    bin_inf = pd.DataFrame(columns=['ID', 'mmsi', 'timestamp', 'match'])

    # Data structure for JSON export
    export_data = {
        "fps": fps,
        "original_size": [int(im_shape[0]), int(im_shape[1])],
        "display_size": [show_size, int(show_size * im_shape[1] / im_shape[0])],
        "frames": []
    }

    print('Start Time: %s || Stamp: %d || fps: %d' % (time0, timestamp0, fps))
    times = 0
    time_i = 0
    sum_t = []
    frame_count = 0

    while True:
        # Read frame
        _, im = cap.read()
        if im is None:
            break
        start = time.time()
        
        # Update timestamp
        Time, timestamp, Time_name = update_time(Time, t)
        
        # Process AIS, VIS, and FUS
        AIS_vis, AIS_cur = AIS.process(arg.camera_para, timestamp, Time_name)
        Vis_tra, Vis_cur = VIS.feedCap(im, timestamp, AIS_vis, bin_inf)
        Fus_tra, bin_inf = FUS.fusion(AIS_vis, AIS_cur, Vis_tra, Vis_cur, timestamp)

        end = time.time() - start
        time_i = time_i + end
        if timestamp % 1000 < t:
            gen_result(times, Vis_cur, Fus_tra, arg.result_metric, im_shape)
            times = times+1
            sum_t.append(time_i)
            print('Time: %s || Stamp: %d || Process: %.6f || Average: %.6f +- %.6f'%(Time_name, timestamp, time_i, np.mean(sum_t), np.std(sum_t)))
            time_i = 0

        # Draw trajectories and get frame data
        im = DRA.draw_traj(im, AIS_vis, AIS_cur, Vis_tra, Vis_cur, Fus_tra, timestamp)
        
        # Get bounding box data for this frame
        frame_boxes = []
        if hasattr(DRA, 'last_boxes') and DRA.last_boxes:
            for box_data in DRA.last_boxes:
                # Get AIS data if available
                ais_data = None
                if box_data['has_ais']:
                    # Find corresponding fusion data
                    for _, fus_row in Fus_tra.iterrows():
                        if fus_row['ID'] == box_data['id']:
                            ais_data = {
                                "mmsi": int(fus_row['mmsi']),
                                "sog": round(fus_row['speed'], 5),
                                "cog": round(fus_row['course'], 5),
                                "lat": round(fus_row['lat'], 5),
                                "lon": round(fus_row['lon'], 5)
                            }
                            break
                
                # Get info box coordinates from df_draw if available
                inf_box = None
                if hasattr(DRA, 'df_draw') and not DRA.df_draw.empty:
                    matching_rows = DRA.df_draw[DRA.df_draw['id'] == box_data['id']]
                    if not matching_rows.empty:
                        row = matching_rows.iloc[0]
                        inf_box = [int(row['inf_x1']), int(row['inf_y1']), 
                                  int(row['inf_x2']), int(row['inf_y2'])]
                
                frame_boxes.append({
                    "id": box_data['id'],
                    "box": box_data['box'],
                    "has_ais": box_data['has_ais'],
                    "ais_data": ais_data,
                    "inf_box": inf_box,
                    "color": [204, 204, 51] if box_data['has_ais'] else [0, 0, 255]
                })

        # Add frame data to export
        export_data["frames"].append({
            "frame_num": frame_count,
            "timestamp": timestamp,
            "time_name": Time_name,
            "boxes": frame_boxes
        })

        # Process and save video frame
        result = imutils.resize(im, height=show_size)
        if videoWriter is None:
            fourcc = cv2.VideoWriter_fourcc('m', 'p', '4', 'v')
            videoWriter = cv2.VideoWriter(
                arg.result_video, fourcc, fps, (result.shape[1], result.shape[0]))

        videoWriter.write(result)
        frame_count += 1

    # Save bounding box data to JSON
    bbox_json_path = os.path.join(os.path.dirname(arg.result_video), 'bbox_data.json')
    with open(bbox_json_path, 'w') as f:
        json.dump(export_data, f, indent=2)
    
    print(f"Exported {frame_count} frames to {bbox_json_path}")
    print(f"Video saved to {arg.result_video}")
    
    cap.release()
    videoWriter.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    # Parse arguments (same as main.py)
    parser = argparse.ArgumentParser(description = "DeepSORVF - Export BBox Data")
    
    parser.add_argument("--anti", type=int, default = 1, help='anti-occlusion True/1|False/0')
    parser.add_argument("--anti_rate", type=int, default = 0, help='occlusion rate 0-1')
    
    parser.add_argument("--data_path", type=str, default = './clip-01/', help='data path')
    parser.add_argument("--result_path", type=str, default = './result/', help='result path')
    
    video_path, ais_path, result_video, result_metric, initial_time,\
        camera_para = read_all(parser.parse_args().data_path, parser.parse_args().result_path)

    parser.add_argument("--video_path", type=str, default = video_path, help='video path')
    parser.add_argument("--ais_path", type=str, default = ais_path, help='ais path')
    parser.add_argument("--result_video", type=str, default = result_video, help='result video')
    parser.add_argument("--result_metric", type=str, default = result_metric, help='result metric')
    parser.add_argument("--initial_time", type=list, default = initial_time, help='initial time')
    parser.add_argument("--camera_para", type=list, default = camera_para, help='camera para')

    argspar = parser.parse_args()
    
    print("\nVesselSORT - Export Mode")
    for p, v in zip(argspar.__dict__.keys(), argspar.__dict__.values()):
        print('\t{}: {}'.format(p, v))
    print('\n')
    arg = parser.parse_args()
    
    export_bbox_data(arg)
