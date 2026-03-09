import cv2
import numpy as np

def test_image(path):
    bgr = cv2.imread(path)
    if bgr is None:
        print(f"Could not read {path}")
        return

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    
    entropy_total = 0.0
    for ch in cv2.split(bgr):
        hist = cv2.calcHist([ch], [0], None, [256], [0, 256]).flatten()
        hist = hist[hist > 0]
        hist /= hist.sum()
        entropy_total += float(-np.sum(hist * np.log2(hist)))
        
    thumb = cv2.resize(bgr, (100, 100))
    unique_colors = len(np.unique(thumb.reshape(-1, 3), axis=0))
    
    block_size = 16
    h, w = gray.shape
    block_vars = []
    for i in range(0, h - block_size, block_size):
        for j in range(0, w - block_size, block_size):
            block_vars.append(np.var(gray[i:i + block_size, j:j + block_size].astype(np.float32)))
    local_var_std = float(np.std(block_vars)) if block_vars else 0.0

    print(f"Stats for {path}:")
    print(f"lap_var: {lap_var}")
    print(f"entropy: {entropy_total}")
    print(f"unique_colors: {unique_colors}")
    print(f"local_var_std: {local_var_std}")

    # Extra features
    # Background uniformity
    # Let's say background is anything not green/brown/yellow
    lower_leaf = np.array([10, 40, 20])
    upper_leaf = np.array([85, 255, 255])
    leaf_mask = cv2.inRange(hsv, lower_leaf, upper_leaf)
    
    bg_mask = cv2.bitwise_not(leaf_mask)
    bg_pixels = gray[bg_mask > 0]
    
    bg_ratio = len(bg_pixels) / (h * w)
    
    if len(bg_pixels) > 0:
        bg_std = float(np.std(bg_pixels))
    else:
        bg_std = -1.0
        
    print(f"bg_ratio: {bg_ratio:.2f}")
    print(f"bg_std: {bg_std:.2f}")

    # Bright low-saturation background ratio (paper)
    # paper: sat < 40 and val > 200
    paper_mask = cv2.inRange(hsv, np.array([0, 0, 180]), np.array([179, 50, 255]))
    paper_ratio = cv2.countNonZero(paper_mask) / (h * w)
    print(f"paper_ratio: {paper_ratio:.2f}")


test_image(r"C:\Users\Lenovo\Downloads\leaff.jpg")
test_image(r"C:\Users\krish\Downloads\leaff.jpg") # Could be krish or Lenovo
test_image(r"C:\Users\krish\OneDrive\Desktop\SWE2.0\backend\SWE_AI_CROP_BACK\ai_service\test_image.jpg")

