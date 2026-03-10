import cv2
import numpy as np
import urllib.request
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

def test_image(url, name):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req)
        arr = np.asarray(bytearray(response.read()), dtype=np.uint8)
        bgr = cv2.imdecode(arr, -1)
        if bgr is None:
            print(f"[{name}] Failed to decode")
            return
            
        img_np = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        
        hsv  = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        total_pixels = gray.shape[0] * gray.shape[1]
        paper_mask = cv2.inRange(hsv, np.array([0, 0, 150]), np.array([179, 45, 255]))
        paper_ratio = cv2.countNonZero(paper_mask) / total_pixels

        edges = cv2.Canny(gray, 100, 200)
        edge_density = float(np.count_nonzero(edges)) / total_pixels

        thumb = cv2.resize(bgr, (100, 100))
        unique_colors = len(np.unique(thumb.reshape(-1, 3), axis=0))
        
        # Center crop check
        h, w = img_np.shape[:2]
        center = img_np[int(h*0.25):int(h*0.75), int(w*0.25):int(w*0.75)]
        
        def leaf_ratio(arr):
            b = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            h = cv2.cvtColor(b, cv2.COLOR_BGR2HSV)
            lower_green  = np.array([30, 30, 30])
            upper_green  = np.array([90, 255, 255])
            lower_brown  = np.array([10, 30, 30])
            upper_brown  = np.array([35, 255, 255])
            green_mask  = cv2.inRange(h, lower_green,  upper_green)
            brown_mask  = cv2.inRange(h, lower_brown,  upper_brown)
            return cv2.countNonZero(green_mask | brown_mask) / (arr.shape[0] * arr.shape[1])

        full_ratio = leaf_ratio(img_np)
        center_ratio = leaf_ratio(center)
        
        print(f"[{name}] paper={paper_ratio:.2f}, edges={edge_density:.4f}, colors={unique_colors}, full_leaf={full_ratio:.2f}, center_leaf={center_ratio:.2f}")
    except Exception as e:
        print(f"[{name}] Error: {e}")

test_image('https://upload.wikimedia.org/wikipedia/commons/4/4b/Grape_black_rot.jpg', 'Real Grape Leaf')
test_image('https://cdn.pixabay.com/photo/2012/04/18/13/21/leaf-37006_960_720.png', 'Cartoon Leaf')
test_image('https://upload.wikimedia.org/wikipedia/commons/4/43/Cute_dog.jpg', 'Dog')
