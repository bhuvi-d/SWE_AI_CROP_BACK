from fastapi import FastAPI, File, UploadFile
import tensorflow as tf
import numpy as np
from PIL import Image
import io

app = FastAPI()


MODEL_PATH = "crop_disease_model.keras"   

model = tf.keras.models.load_model(MODEL_PATH)


CLASS_NAMES = [
    "Tomato_Early_blight",
    "Tomato_Late_blight",
    "Tomato_Healthy"
]

IMG_SIZE = 224


def preprocess(img):

    img = img.resize((IMG_SIZE, IMG_SIZE))
    img = np.array(img) / 255.0
    img = np.expand_dims(img, axis=0)

    return img


@app.post("/predict")
async def predict(file: UploadFile = File(...)):

    data = await file.read()

    img = Image.open(io.BytesIO(data)).convert("RGB")

    img = preprocess(img)

    preds = model.predict(img)

    idx = np.argmax(preds)
    conf = float(np.max(preds))

    return {
        "disease": CLASS_NAMES[idx],
        "confidence": round(conf, 3)
    }
