from flask import Flask, request, jsonify, send_from_directory
import tensorflow as tf
from PIL import Image
import numpy as np
import os

app = Flask(__name__)

# Enable CORS for React Native
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Health check endpoint
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'Server is running'})

# Load the .keras model
try:
    model = tf.keras.models.load_model('malaria_model_128x128_best.keras', compile=False)
    model.compile(optimizer='adam', loss='binary_crossentropy')
    print("Model loaded successfully")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

# Predict a single image
@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 500
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    try:
        file = request.files['image']
        img = Image.open(file).resize((128, 128)).convert('RGB')
        img_array = np.array(img) / 255.0
        img_array = np.expand_dims(img_array, axis=0)
        prediction = model.predict(img_array, verbose=0)[0][0]
        class_label = 'Parasitized' if prediction >= 0.5 else 'Uninfected'
        confidence = prediction if prediction >= 0.5 else 1 - prediction
        return jsonify({
            'class': class_label,
            'confidence': float(confidence)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Predict all images in the micrographs folder
@app.route('/predict_folder', methods=['POST'])
def predict_folder():
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 500
    # Get the parent directory (Malaria folder) and look for micrographs there
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    folder_path = os.path.join(parent_dir, 'micrographs')
    if not os.path.isdir(folder_path):
        return jsonify({'error': f'Folder not found: {folder_path}'}), 400
    results = []
    valid_extensions = ('.jpg', '.jpeg', '.png')
    for image_name in os.listdir(folder_path):
        if not image_name.lower().endswith(valid_extensions):
            continue
        image_path = os.path.join(folder_path, image_name)
        try:
            img = Image.open(image_path).resize((128, 128)).convert('RGB')
            img_array = np.array(img) / 255.0
            img_array = np.expand_dims(img_array, axis=0)
            prediction = model.predict(img_array, verbose=0)[0][0]
            class_label = 'Parasitized' if prediction >= 0.5 else 'Uninfected'
            confidence = prediction if prediction >= 0.5 else 1 - prediction
            results.append({
                'image': image_name,
                'class': class_label,
                'confidence': float(confidence)
            })
        except Exception as e:
            results.append({'image': image_name, 'error': str(e)})
    return jsonify(results)

# Serve images from the micrographs folder
@app.route('/micrographs/<filename>')
def serve_image(filename):
    # Get the parent directory (Malaria folder) and look for micrographs there
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    folder_path = os.path.join(parent_dir, 'micrographs')
    return send_from_directory(folder_path, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)