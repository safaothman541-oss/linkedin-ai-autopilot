#!/usr/bin/env python3
# reframe.py — smart 9:16 reframe that FOLLOWS THE SPEAKER. Detects the face
# each frame (OpenCV YuNet), smooths the horizontal centre (EMA) so the crop
# glides instead of jerking, and crops a vertical 1080x1920 window that keeps
# the speaker centred. Falls back to a centred crop when no face is visible.
# Outputs video only (audio is muxed back during compose).
#
# Usage: python reframe.py <in_clip> <out_mp4> [out_w=1080] [out_h=1920]
import sys, os, urllib.request
import cv2
import numpy as np

MODEL_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "face_detection_yunet.onnx")


def ensure_model():
    if not os.path.exists(MODEL_PATH):
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        print(f"downloading YuNet model…", file=sys.stderr)
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    return MODEL_PATH


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "reframed.mp4"
    OW = int(sys.argv[3]) if len(sys.argv) > 3 else 1080
    OH = int(sys.argv[4]) if len(sys.argv) > 4 else 1920

    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        print("cannot open input", file=sys.stderr); sys.exit(1)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    # target crop window inside the source that has a 9:16 (OW:OH) aspect.
    ar = OW / OH
    if W / H > ar:            # landscape source → full height, track horizontally
        cw, ch, axis = int(round(H * ar)), H, "x"
    else:                      # tall/square source → full width, track vertically
        cw, ch, axis = W, int(round(W / ar)), "y"
    cw, ch = min(cw, W), min(ch, H)

    det = cv2.FaceDetectorYN.create(ensure_model(), "", (W, H), score_threshold=0.6, nms_threshold=0.3, top_k=50)
    det.setInputSize((W, H))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    vw = cv2.VideoWriter(out, fourcc, fps, (OW, OH))

    center = (W / 2) if axis == "x" else (H / 2)   # smoothed crop centre
    span = (W - cw) if axis == "x" else (H - ch)   # max travel of the top-left
    alpha = 0.12                                   # EMA factor: lower = smoother
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        # detect every 2nd frame (YuNet is cheap; EMA fills the gaps smoothly)
        if i % 2 == 0:
            try:
                _, faces = det.detect(frame)
            except cv2.error:
                faces = None
            if faces is not None and len(faces):
                # pick the largest face (most likely the on-screen speaker)
                f = max(faces, key=lambda r: r[2] * r[3])
                target = (f[0] + f[2] / 2) if axis == "x" else (f[1] + f[3] / 2)
                center = alpha * float(target) + (1 - alpha) * center
        i += 1

        if axis == "x":
            x = int(round(min(max(center - cw / 2, 0), W - cw)))
            crop = frame[0:ch, x:x + cw]
        else:
            y = int(round(min(max(center - ch / 2, 0), H - ch)))
            crop = frame[y:y + ch, 0:cw]
        vw.write(cv2.resize(crop, (OW, OH), interpolation=cv2.INTER_AREA))

    cap.release(); vw.release()
    print(f"reframed {i} frames @ {fps:.0f}fps → {OW}x{OH} (tracked {axis}, span {span}px)")


if __name__ == "__main__":
    main()
