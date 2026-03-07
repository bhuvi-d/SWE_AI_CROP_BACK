from fastapi import FastAPI, UploadFile, File
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import base64
import cv2

from class_names import CLASS_NAMES, DISEASE_SEVERITY_MAP, SEVERITY_THRESHOLDS

app = FastAPI()

IMG_SIZE = 224
NUM_CLASSES = 38

print("Loading CNN model...")

data_augmentation = tf.keras.Sequential([
    tf.keras.layers.RandomFlip("horizontal"),
    tf.keras.layers.RandomRotation(0.1),
])

normalization = tf.keras.layers.Rescaling(1./255)

base_model = tf.keras.applications.MobileNetV2(
    input_shape=(IMG_SIZE, IMG_SIZE, 3),
    include_top=False,
    weights="imagenet"
)
base_model.trainable = False

# Define model using Functional API for robust input/output access (needed for Grad-CAM)
inputs = tf.keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
x = data_augmentation(inputs)
x = normalization(x)
# Pass through MobileNetV2 base model
x = base_model(x, training=False)
# Capture base_model output for Grad-CAM before pooling
base_model_output = x 
x = tf.keras.layers.GlobalAveragePooling2D()(x)
x = tf.keras.layers.Dropout(0.3)(x)
outputs = tf.keras.layers.Dense(NUM_CLASSES, activation="softmax")(x)

model = tf.keras.Model(inputs=inputs, outputs=outputs)
model.load_weights("model.weights.h5")

print("CNN READY")

# ---------- GRAD-CAM ----------

# Build a functional sub-model for Grad-CAM
# Inputs: original image input
# Outputs: [feature maps from last conv layer, final prediction]
_gradcam_model = tf.keras.Model(
    inputs=model.inputs,
    outputs=[
        base_model_output,  # feature map from MobileNetV2
        model.output        # final softmax predictions
    ]
)


def generate_gradcam(img_array: np.ndarray, class_index: int) -> np.ndarray:
    """
    Generate a Grad-CAM heatmap for the given image and predicted class.
    Returns a normalised heatmap as a 2D numpy array (0..1).
    """
    img_tensor = tf.cast(img_array, tf.float32)

    with tf.GradientTape() as tape:
        tape.watch(img_tensor)
        conv_outputs, predictions = _gradcam_model(img_tensor, training=False)
        target_class = predictions[:, class_index]

    # Gradients of the target class w.r.t. the last conv layer output
    grads = tape.gradient(target_class, conv_outputs)

    # Global-average-pool the gradients to get channel importance weights
    weights = tf.reduce_mean(grads, axis=(1, 2), keepdims=True)

    # Weighted sum of the conv output channels
    cam = tf.reduce_sum(weights * conv_outputs, axis=-1).numpy()[0]

    # ReLU and normalise
    cam = np.maximum(cam, 0)
    if cam.max() > 0:
        cam = cam / cam.max()

    return cam


def overlay_heatmap(
    original_image: np.ndarray,
    heatmap: np.ndarray,
    alpha: float = 0.45,
    colormap: int = cv2.COLORMAP_JET,
) -> np.ndarray:
    """
    Overlay a heatmap onto the original image.
    Returns an RGB image as uint8 numpy array.
    """
    h, w = original_image.shape[:2]
    heatmap_resized = cv2.resize(heatmap, (w, h))
    heatmap_uint8 = np.uint8(255 * heatmap_resized)
    heatmap_colored = cv2.applyColorMap(heatmap_uint8, colormap)
    heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)
    overlaid = np.uint8(original_image * (1 - alpha) + heatmap_colored * alpha)
    return overlaid


def image_to_base64(image_array: np.ndarray) -> str:
    """Encode an RGB numpy array to a base64 PNG string."""
    img = Image.fromarray(image_array)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")

# ---------- SEVERITY CLASSIFICATION ----------


def classify_severity(confidence: float, class_name: str) -> dict:
    """
    Classify disease severity based on confidence and inherent disease weight.
    Returns { level, label, description }.
    """
    inherent_weight = DISEASE_SEVERITY_MAP.get(class_name, 1)

    # Healthy plants
    if inherent_weight == 0 or "healthy" in class_name.lower():
        return {
            "level": "healthy",
            "label": "Healthy",
            "description": "No disease detected. Plant appears healthy."
        }

    # Combined severity score: inherent weight (0-3) × confidence (0-1) → 0-3
    severity_score = inherent_weight * confidence

    if severity_score >= 2.2:
        return {
            "level": "severe",
            "label": "Severe",
            "description": "High severity infection detected. Immediate action required."
        }
    elif severity_score >= 1.3:
        return {
            "level": "moderate",
            "label": "Moderate",
            "description": "Moderate infection detected. Treatment recommended soon."
        }
    else:
        return {
            "level": "mild",
            "label": "Mild",
            "description": "Early-stage infection detected. Monitor closely."
        }

# ---------- LEAF VALIDATION ----------


def is_leaf_image(image):
    # A strict green-pixel check fails for diseased (yellow/brown/black) leaves.
    # Disabling this heuristic to allow the CNN to evaluate all images.
    return True

# ---------- PREDICTION ENDPOINT ----------


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    # leaf validation
    if not is_leaf_image(image):
        return {
            "success": False,
            "error": "Uploaded image does not appear to be a plant leaf"
        }

    # Keep original for heatmap overlay
    original_np = np.array(image)

    image_resized = image.resize((IMG_SIZE, IMG_SIZE))
    img = np.array(image_resized)
    img_batch = np.expand_dims(img, axis=0)

    # Run prediction
    pred = model.predict(img_batch, verbose=0)
    pred_array = pred[0]

    class_index = int(np.argmax(pred_array))
    confidence = float(np.max(pred_array))
    class_name = CLASS_NAMES[class_index]

    # Extract crop name
    crop_name = class_name.split("___")[0].replace("_", " ").replace("(", "").replace(")", "").strip()
    disease_name = class_name.split("___")[1].replace("_", " ").strip() if "___" in class_name else "Unknown"

    # Top-5 predictions
    top_indices = np.argsort(pred_array)[::-1][:5]
    top_predictions = []
    for idx in top_indices:
        label = CLASS_NAMES[idx]
        c = label.split("___")[0].replace("_", " ").replace("(", "").replace(")", "").strip()
        d = label.split("___")[1].replace("_", " ").strip() if "___" in label else "Unknown"
        top_predictions.append({
            "class_index": int(idx),
            "class_name": label,
            "crop": c,
            "disease": d,
            "confidence": float(pred_array[idx])
        })

    # Severity classification
    severity = classify_severity(confidence, class_name)

    # Grad-CAM heatmap
    heatmap_base64 = None
    try:
        cam = generate_gradcam(img_batch, class_index)
        overlaid = overlay_heatmap(original_np, cam)
        heatmap_base64 = image_to_base64(overlaid)
    except Exception as e:
        print(f"Grad-CAM generation failed (non-fatal): {e}")

    return {
        "success": True,
        "class_index": class_index,
        "class_name": class_name,
        "crop_name": crop_name,
        "disease_name": disease_name,
        "confidence": confidence,
        "top_predictions": top_predictions,
        "severity": severity,
        "heatmap_base64": heatmap_base64
    }
