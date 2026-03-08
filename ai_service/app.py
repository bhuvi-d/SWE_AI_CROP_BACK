from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import base64
import cv2
import os

from class_names import CLASS_NAMES, DISEASE_SEVERITY_MAP, SEVERITY_THRESHOLDS

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# SPECIALIST MODEL REGISTRY
# Each entry maps a set of crop keywords to a dedicated model.
# The specialist models are stored in ai_models/ next to ai_service/.
# ============================================================

# All .h5 model files live alongside app.py in ai_service/
AI_MODELS_DIR = os.path.dirname(os.path.abspath(__file__))

SPECIALIST_MODELS = {
    "tomato": {
        "path": os.path.join(AI_MODELS_DIR, "tomato_disease_model.h5"),
        "img_size": 256,
        "img_mode": "RGB",       # (H, W, C) — colour model
        "classes": [
            "Tomato___Bacterial_spot",
            "Tomato___Early_blight",
            "Tomato___Late_blight",
            "Tomato___Leaf_Mold",
            "Tomato___Septoria_leaf_spot",
            "Tomato___Spider_mites",
            "Tomato___Target_Spot",
            "Tomato___Yellow_Leaf_Curl_Virus",
            "Tomato___Tomato_mosaic_virus",
            "Tomato___healthy",
        ],
    },
    "potato": {
        "path": os.path.join(AI_MODELS_DIR, "potato_disease_model.h5"),
        "img_size": 256,
        "img_mode": "RGB",
        "classes": [
            "Potato___Early_blight",
            "Potato___Late_blight",
            "Potato___healthy",
        ],
    },
    "grape": {
        "path": os.path.join(AI_MODELS_DIR, "grape_disease_model.h5"),
        "img_size": 256,
        "img_mode": "L",          # Grayscale — single-channel model (H, W, 1)
        "classes": [
            "Grape___Black_rot",
            "Grape___Esca_(Black_Measles)",
            "Grape___Leaf_blight",
            "Grape___healthy",
        ],
    },
    "maize": {
        "path": os.path.join(AI_MODELS_DIR, "maize_disease_model.h5"),
        "img_size": 224,
        "img_mode": "RGB",
        "classes": [
            "Corn_(maize)___Cercospora_leaf_spot",
            "Corn_(maize)___Common_rust",
            "Corn_(maize)___Northern_Leaf_Blight",
            "Corn_(maize)___healthy",
        ],
    },
    "rice": {
        "path": os.path.join(AI_MODELS_DIR, "rice_disease_model.h5"),
        "img_size": 299,
        "img_mode": "RGB",
        "classes": [
            "Rice___Brown_spot",
            "Rice___Leaf_blast",
            "Rice___healthy",
        ],
    },
}

# ---- Load specialist models once at startup ----
_specialist_loaded: dict = {}
for crop_key, cfg in SPECIALIST_MODELS.items():
    if os.path.exists(cfg["path"]):
        print(f"Loading specialist model: {crop_key} ...")
        _specialist_loaded[crop_key] = tf.keras.models.load_model(
            cfg["path"], compile=False
        )
        print(f"  ✓ {crop_key} model loaded ({cfg['classes'][0][:40]}...)")
    else:
        print(f"  ⚠ {crop_key} model NOT found at {cfg['path']}, skipping.")

# ============================================================
# GENERAL (FALLBACK) MODEL — original MobileNetV2 38-class model
# ============================================================

IMG_SIZE = 224
NUM_CLASSES = 38

print("Loading general CNN model...")

data_augmentation = tf.keras.Sequential([
    tf.keras.layers.RandomFlip("horizontal"),
    tf.keras.layers.RandomRotation(0.1),
])

normalization = tf.keras.layers.Rescaling(1./255)

base_model = tf.keras.applications.MobileNetV2(
    input_shape=(IMG_SIZE, IMG_SIZE, 3),
    include_top=False,
    weights="imagenet",
)
base_model.trainable = False

inputs = tf.keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
x = data_augmentation(inputs)
x = normalization(x)
x = base_model(x, training=False)
base_model_output = x
x = tf.keras.layers.GlobalAveragePooling2D()(x)
x = tf.keras.layers.Dropout(0.3)(x)
outputs = tf.keras.layers.Dense(NUM_CLASSES, activation="softmax")(x)

general_model = tf.keras.Model(inputs=inputs, outputs=outputs)
general_model.load_weights("model.weights.h5")
print("General CNN READY")

# Grad-CAM sub-model for the general model
_gradcam_model = tf.keras.Model(
    inputs=general_model.inputs,
    outputs=[base_model_output, general_model.output],
)


# ============================================================
# CROP ROUTING — decide which model to use
# ============================================================

def _route_crop(class_name: str) -> str | None:
    """Return a specialist key if the predicted class belongs to a specialist crop."""
    lc = class_name.lower()
    if "tomato" in lc:
        return "tomato"
    if "potato" in lc:
        return "potato"
    if "grape" in lc:
        return "grape"
    if "corn" in lc or "maize" in lc:
        return "maize"
    if "rice" in lc:
        return "rice"
    return None


# ============================================================
# SPECIALIST PREDICTION
# ============================================================

def _predict_specialist(crop_key: str, img_pil: Image.Image) -> dict:
    cfg = SPECIALIST_MODELS[crop_key]
    specialist_model = _specialist_loaded[crop_key]
    size = cfg["img_size"]
    mode = cfg["img_mode"]

    img = img_pil.convert(mode).resize((size, size))
    arr = np.array(img, dtype=np.float32) / 255.0

    # Add channel dim for grayscale models
    if mode == "L":
        arr = np.expand_dims(arr, axis=-1)   # (H, W, 1)

    arr = np.expand_dims(arr, axis=0)         # (1, H, W, C)

    pred = specialist_model.predict(arr, verbose=0)[0]
    class_index = int(np.argmax(pred))
    confidence = float(np.max(pred))
    class_name = cfg["classes"][class_index]

    # Top-5 (or all available)
    n_top = min(5, len(pred))
    top_indices = np.argsort(pred)[::-1][:n_top]
    top_predictions = []
    for idx in top_indices:
        label = cfg["classes"][int(idx)]
        crop_part = label.split("___")[0].replace("_", " ").replace("(", "").replace(")", "").strip()
        disease_part = label.split("___")[1].replace("_", " ").strip() if "___" in label else "Unknown"
        top_predictions.append({
            "class_index": int(idx),
            "class_name": label,
            "crop": crop_part,
            "disease": disease_part,
            "confidence": float(pred[idx]),
        })

    crop_name = class_name.split("___")[0].replace("_", " ").replace("(", "").replace(")", "").strip()
    disease_name = class_name.split("___")[1].replace("_", " ").strip() if "___" in class_name else "Unknown"

    severity = classify_severity(confidence, class_name)

    return {
        "success": True,
        "source": f"specialist:{crop_key}",
        "class_index": class_index,
        "class_name": class_name,
        "crop_name": crop_name,
        "disease_name": disease_name,
        "confidence": confidence,
        "top_predictions": top_predictions,
        "severity": severity,
        "heatmap_base64": None,   # Grad-CAM not built for specialist models
    }


# ============================================================
# GRAD-CAM HELPERS (general model only)
# ============================================================

def generate_gradcam(img_array: np.ndarray, class_index: int) -> np.ndarray:
    img_tensor = tf.cast(img_array, tf.float32)
    with tf.GradientTape() as tape:
        tape.watch(img_tensor)
        conv_outputs, predictions = _gradcam_model(img_tensor, training=False)
        target_class = predictions[:, class_index]
    grads = tape.gradient(target_class, conv_outputs)
    weights = tf.reduce_mean(grads, axis=(1, 2), keepdims=True)
    cam = tf.reduce_sum(weights * conv_outputs, axis=-1).numpy()[0]
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
    h, w = original_image.shape[:2]
    heatmap_resized = cv2.resize(heatmap, (w, h))
    heatmap_uint8 = np.uint8(255 * heatmap_resized)
    heatmap_colored = cv2.applyColorMap(heatmap_uint8, colormap)
    heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)
    overlaid = np.uint8(original_image * (1 - alpha) + heatmap_colored * alpha)
    return overlaid


def image_to_base64(image_array: np.ndarray) -> str:
    img = Image.fromarray(image_array)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ============================================================
# SEVERITY CLASSIFICATION
# ============================================================

def classify_severity(confidence: float, class_name: str) -> dict:
    inherent_weight = DISEASE_SEVERITY_MAP.get(class_name, 1)

    if inherent_weight == 0 or "healthy" in class_name.lower():
        return {
            "level": "healthy",
            "label": "Healthy",
            "description": "No disease detected. Plant appears healthy.",
        }

    severity_score = inherent_weight * confidence

    if severity_score >= 2.2:
        return {
            "level": "severe",
            "label": "Severe",
            "description": "High severity infection detected. Immediate action required.",
        }
    elif severity_score >= 1.3:
        return {
            "level": "moderate",
            "label": "Moderate",
            "description": "Moderate infection detected. Treatment recommended soon.",
        }
    else:
        return {
            "level": "mild",
            "label": "Mild",
            "description": "Early-stage infection detected. Monitor closely.",
        }


# ============================================================
# PREDICT ENDPOINT
# ============================================================

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    original_np = np.array(image)

    # ---- STEP 1: General model for initial crop classification ----
    image_resized = image.resize((IMG_SIZE, IMG_SIZE))
    img = np.array(image_resized)
    img_batch = np.expand_dims(img, axis=0)

    pred = general_model.predict(img_batch, verbose=0)
    pred_array = pred[0]

    general_class_index = int(np.argmax(pred_array))
    general_confidence = float(np.max(pred_array))
    general_class_name = CLASS_NAMES[general_class_index]

    print(f"General model: {general_class_name} ({general_confidence:.2%})")

    # ---- STEP 2: Route to specialist if one exists ----
    specialist_key = _route_crop(general_class_name)

    if specialist_key and specialist_key in _specialist_loaded:
        print(f"Routing to specialist model: {specialist_key}")
        result = _predict_specialist(specialist_key, image)

        # Attempt Grad-CAM on general model even when specialist is used
        try:
            cam = generate_gradcam(img_batch, general_class_index)
            overlaid = overlay_heatmap(original_np, cam)
            result["heatmap_base64"] = image_to_base64(overlaid)
        except Exception as e:
            print(f"Grad-CAM failed (non-fatal): {e}")
            result["heatmap_base64"] = None

        return result

    # ---- STEP 3: Fallback — use general model result ----
    print("Using general model result (no specialist found).")

    crop_name = general_class_name.split("___")[0].replace("_", " ").replace("(", "").replace(")", "").strip()
    disease_name = (
        general_class_name.split("___")[1].replace("_", " ").strip()
        if "___" in general_class_name else "Unknown"
    )

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
            "confidence": float(pred_array[idx]),
        })

    severity = classify_severity(general_confidence, general_class_name)

    heatmap_base64 = None
    try:
        cam = generate_gradcam(img_batch, general_class_index)
        overlaid = overlay_heatmap(original_np, cam)
        heatmap_base64 = image_to_base64(overlaid)
    except Exception as e:
        print(f"Grad-CAM generation failed (non-fatal): {e}")

    return {
        "success": True,
        "source": "general",
        "class_index": general_class_index,
        "class_name": general_class_name,
        "crop_name": crop_name,
        "disease_name": disease_name,
        "confidence": general_confidence,
        "top_predictions": top_predictions,
        "severity": severity,
        "heatmap_base64": heatmap_base64,
    }
