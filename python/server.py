from flask import Flask, request, jsonify, send_from_directory
# Use tensorflow-cpu (works better on Windows)
import tensorflow as tf
from PIL import Image
import numpy as np
import os
import time
import traceback

app = Flask(__name__)
# Increase max content length for large image uploads (16MB)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

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

# Load labels from labels.txt
def load_labels():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    labels_path = os.path.join(parent_dir, 'assets', 'models', 'labels.txt')
    try:
        with open(labels_path, 'r') as f:
            labels = [line.strip() for line in f.readlines()]
        print(f"Labels loaded: {labels}")
        return labels
    except Exception as e:
        print(f"Error loading labels: {e}")
        return []

# Load the TensorFlow Lite model
labels = load_labels()
try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    model_path = os.path.join(parent_dir, 'assets', 'models', 'cell_classifier_fp16.tflite')
    interpreter = tf.lite.Interpreter(model_path=model_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    print("TensorFlow Lite model loaded successfully")
    print(f"Input shape: {input_details[0]['shape']}")
    print(f"Output shape: {output_details[0]['shape']}")
except Exception as e:
    print(f"Error loading model: {e}")
    interpreter = None
    input_details = None
    output_details = None

# Predict a single image
@app.route('/predict', methods=['POST'])
def predict():
    start_time = time.time()
    print(f"[{time.strftime('%H:%M:%S')}] Received prediction request")
    
    if interpreter is None:
        print("ERROR: Model not loaded!")
        return jsonify({'error': 'Model not loaded'}), 500
    
    if 'image' not in request.files:
        print("ERROR: No image in request files")
        print(f"Available files: {list(request.files.keys())}")
        print(f"Request content type: {request.content_type}")
        print(f"Request form keys: {list(request.form.keys())}")
        return jsonify({'error': 'No image provided'}), 400
    
    try:
        file = request.files['image']
        print(f"[{time.strftime('%H:%M:%S')}] Processing image: {file.filename if file.filename else 'unnamed'}")
        # Preprocess image: resize to 224x224, convert to RGB, normalize to [0, 1]
        # The model was trained on 224x224 images, so this is the critical resize
        # Client already compresses to 800px, so we can directly resize to 224x224
        img = Image.open(file)
        # If image is still very large (shouldn't happen with client compression, but safety check)
        # Use faster BILINEAR for intermediate resize if needed, LANCZOS for final resize
        if img.size[0] > 1024 or img.size[1] > 1024:
            img.thumbnail((1024, 1024), Image.Resampling.BILINEAR)
        # Use LANCZOS for final resize to model input size - this is critical for prediction quality
        img = img.resize((224, 224), Image.Resampling.LANCZOS).convert('RGB')
        img_array = np.array(img, dtype=np.float32) / 255.0
        # Reshape to [1, 224, 224, 3]
        img_array = np.expand_dims(img_array, axis=0)
        
        # Run inference
        interpreter.set_tensor(input_details[0]['index'], img_array)
        interpreter.invoke()
        output_data = interpreter.get_tensor(output_details[0]['index'])
        
        # Check if output is already probabilities (sum close to 1) or logits
        logits = output_data[0].flatten()
        output_sum = np.sum(logits)
        
        # If sum is close to 1, assume already probabilities, otherwise apply softmax
        if abs(output_sum - 1.0) < 0.01:
            probabilities = logits
        else:
            # Apply softmax to get probabilities (numerically stable version)
            exp_logits = np.exp(logits - np.max(logits))  # Subtract max for numerical stability
            probabilities = exp_logits / np.sum(exp_logits)
        
        # Get predicted class and confidence
        predicted_idx = np.argmax(probabilities)
        confidence = float(probabilities[predicted_idx])
        class_label = labels[predicted_idx] if predicted_idx < len(labels) else f'Class_{predicted_idx}'
        
        elapsed_time = time.time() - start_time
        print(f"[{time.strftime('%H:%M:%S')}] Prediction complete: {class_label} ({confidence:.4f}) in {elapsed_time:.2f}s")
        
        # Only print if there's an issue (low confidence or error)
        if confidence < 0.5:
            print(f"WARNING: Low confidence prediction: {class_label} ({confidence:.4f})")
        
        return jsonify({
            'class': class_label,
            'confidence': confidence
        })
    except Exception as e:
        elapsed_time = time.time() - start_time
        error_msg = str(e)
        print(f"[{time.strftime('%H:%M:%S')}] ERROR after {elapsed_time:.2f}s: {error_msg}")
        print(traceback.format_exc())
        return jsonify({'error': error_msg}), 500

# Predict all images in the micrographs folder
@app.route('/predict_folder', methods=['POST'])
def predict_folder():
    if interpreter is None:
        return jsonify({'error': 'Model not loaded'}), 500
    # Get the parent directory and look for micrographs folder
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
            # Preprocess image: resize to 224x224, convert to RGB, normalize to [0, 1]
            img = Image.open(image_path)
            # If image is very large, resize first to speed up processing
            # Use LANCZOS for better quality even in intermediate steps (medical images need detail)
            if img.size[0] > 1024 or img.size[1] > 1024:
                img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            # Use LANCZOS for final resize to model input size - this is critical for prediction quality
            img = img.resize((224, 224), Image.Resampling.LANCZOS).convert('RGB')
            img_array = np.array(img, dtype=np.float32) / 255.0
            # Reshape to [1, 224, 224, 3]
            img_array = np.expand_dims(img_array, axis=0)
            
            # Run inference
            interpreter.set_tensor(input_details[0]['index'], img_array)
            interpreter.invoke()
            output_data = interpreter.get_tensor(output_details[0]['index'])
            
            # Check if output is already probabilities (sum close to 1) or logits
            logits = output_data[0].flatten()
            output_sum = np.sum(logits)
            
            # If sum is close to 1, assume already probabilities, otherwise apply softmax
            if abs(output_sum - 1.0) < 0.01:
                probabilities = logits
            else:
                # Apply softmax to get probabilities (numerically stable version)
                exp_logits = np.exp(logits - np.max(logits))
                probabilities = exp_logits / np.sum(exp_logits)
            
            # Get predicted class and confidence
            predicted_idx = np.argmax(probabilities)
            confidence = float(probabilities[predicted_idx])
            class_label = labels[predicted_idx] if predicted_idx < len(labels) else f'Class_{predicted_idx}'
            
            results.append({
                'image': image_name,
                'class': class_label,
                'confidence': confidence
            })
        except Exception as e:
            results.append({'image': image_name, 'error': str(e)})
    return jsonify(results)

# Serve images from the micrographs folder
@app.route('/micrographs/<filename>')
def serve_image(filename):
    # Get the parent directory and look for micrographs folder
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    folder_path = os.path.join(parent_dir, 'micrographs')
    return send_from_directory(folder_path, filename)

if __name__ == '__main__':
    print("=" * 50)
    print("Cervical Cell Classifier Server Starting...")
    print("=" * 50)
    print(f"Model loaded: {interpreter is not None}")
    print(f"Labels: {labels}")
    print(f"Server will run on http://0.0.0.0:5000")
    print("=" * 50)
    # Use threaded mode to handle multiple requests
    app.run(host='0.0.0.0', port=5000, threaded=True)