import cv2
import numpy as np
import urllib.request
import sys

def compute_features(url, name):
    try:
        req = urllib.request.urlopen(url)
        arr = np.asarray(bytearray(req.read()), dtype=np.uint8)
        bgr = cv2.imdecode(arr, -1)
        
        if bgr is None:
            return
            
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        
        # 1. Laplacian variance
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        
        # 2. Entropy
        entropy_total = 0.0
        for ch in cv2.split(bgr):
            hist = cv2.calcHist([ch], [0], None, [256], [0, 256]).flatten()
            hist = hist[hist > 0]
            hist /= hist.sum()
            entropy_total += float(-np.sum(hist * np.log2(hist)))
            
        # 3. Unique colors in 100x100
        thumb = cv2.resize(bgr, (100, 100))
        unique_colors = len(np.unique(thumb.reshape(-1, 3), axis=0))
        
        # 4. Background variance
        lower_green = np.array([35, 40, 40])
        upper_green = np.array([85, 255, 255])
        green_mask = cv2.inRange(hsv, lower_green, upper_green)
        bg_mask = cv2.bitwise_not(green_mask)
        bg_gray = gray[bg_mask > 0]
        bg_var = float(np.var(bg_gray)) if len(bg_gray) > 0 else 0
        
        # 5. Leaf hue variance
        leaf_hues = hsv[:,:,0][green_mask > 0]
        leaf_hue_var = float(np.var(leaf_hues)) if len(leaf_hues) > 0 else 0
        
        # 6. Edge density
        edges = cv2.Canny(gray, 100, 200)
        edge_density = float(np.count_nonzero(edges)) / (gray.shape[0] * gray.shape[1])
        
        print(f"--- {name} ---")
        print(f"Lap Var: {lap_var:.1f}")
        print(f"Entropy: {entropy_total:.1f}")
        print(f"Unique Colors: {unique_colors}")
        print(f"BG Var: {bg_var:.1f}")
        print(f"Leaf Hue Var: {leaf_hue_var:.1f}")
        print(f"Edge Density: {edge_density:.4f}")
        
    except Exception as e:
        print(f"Failed for {name}: {e}")

# Real leaf
compute_features("https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Ash_Tree_-_geograph.org.uk_-_590710.jpg/640px-Ash_Tree_-_geograph.org.uk_-_590710.jpg", "Real Leaf")
# Drawing 1
compute_features("https://img.freepik.com/premium-vector/green-leaf-drawing-white-background_1138248-18182.jpg", "Drawing Clipart")
# Drawing 2
compute_features("https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS8Xf4M5yM74zXm2hQ3G_o6YQZ2O5N_S-Q-_A&s", "Pencil Drawing")

