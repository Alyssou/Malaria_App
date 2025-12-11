# Testing Guide for Cervical Cell Classifier App

## Prerequisites

### 1. Verify Model Files
Make sure these files exist in `assets/models/`:
- ✅ `cell_classifier_fp16.tflite` (your model)
- ✅ `labels.txt` (with 5 labels)

### 2. Python Dependencies
Install required Python packages:

```bash
pip install flask tensorflow pillow numpy
```

Or create a `requirements.txt` and install:
```bash
pip install -r requirements.txt
```

## Step-by-Step Testing

### Step 1: Start the Python Server

1. Open a terminal/command prompt
2. Navigate to the project directory:
   ```bash
   cd path/to/Malaria_App
   ```
3. Navigate to the python directory:
   ```bash
   cd python
   ```
4. Start the Flask server:
   ```bash
   python server.py
   ```

**Expected output:**
```
Labels loaded: ['Dyskeratotic', 'Koliocytotic', 'Metaplastic', 'Parabasal', 'Superficial-Intermediate']
TensorFlow Lite model loaded successfully
Input shape: [1, 224, 224, 3]
Output shape: [1, 5]
 * Running on http://0.0.0.0:5000
```

### Step 2: Verify Server is Running

Test the health endpoint in a browser or with curl:
```bash
curl http://localhost:5000/health
```

Or open in browser: `http://localhost:5000/health`

Expected response:
```json
{"status": "ok", "message": "Server is running"}
```

### Step 3: Update Server URL (if needed)

If testing on a physical device or emulator, you need to update the server URL in `app/homeScreen.tsx`:

**For Android Emulator:**
- Use `http://10.0.2.2:5000` (Android emulator's special IP for localhost)

**For iOS Simulator:**
- Use `http://localhost:5000` or `http://127.0.0.1:5000`

**For Physical Device:**
- Find your computer's local IP address:
  - **Windows**: Run `ipconfig` and look for IPv4 Address
  - **Mac/Linux**: Run `ifconfig` or `ip addr`
- Update line 35 in `app/homeScreen.tsx`:
  ```typescript
  const SERVER_URL = "http://YOUR_IP_ADDRESS:5000";
  ```
- Make sure your device and computer are on the same WiFi network

### Step 4: Start the React Native App

1. Open a **new terminal/command prompt** (keep the server running)
2. Navigate to the project root:
   ```bash
   cd path/to/Malaria_App
   ```
3. Install dependencies (if not already done):
   ```bash
   npm install
   ```
4. Start Expo:
   ```bash
   npx expo start
   ```
5. Choose your platform:
   - Press `a` for Android
   - Press `i` for iOS
   - Press `w` for web
   - Scan QR code with Expo Go app on your phone

### Step 5: Test the App

#### Test 1: Single Image Prediction
1. Tap the **"+"** (FAB) button at bottom right
2. Select an image from your photo library
3. Tap **"Predict Selected"** button
4. Wait for processing
5. Verify:
   - Image shows with a badge icon
   - Cell type label is displayed (one of the 5 types)
   - Confidence percentage is shown

#### Test 2: Folder Prediction
1. Tap **"Predict Folder"** button
2. Wait for processing (processes all images in `micrographs/` folder)
3. Verify:
   - All images from the folder are displayed
   - Each image shows its predicted cell type
   - Summary card shows counts for each cell type

#### Test 3: View Details
1. Tap on any prediction card
2. Verify modal shows:
   - Full-size image
   - Cell type label
   - Confidence score
   - Close button works

#### Test 4: Reset
1. Tap the refresh icon in the app bar
2. Verify all images and predictions are cleared

## Troubleshooting

### Server Issues

**Problem:** `ModuleNotFoundError: No module named 'tensorflow'`
- **Solution:** Install TensorFlow: `pip install tensorflow`

**Problem:** `Error loading model: ...`
- **Solution:** 
  - Verify `cell_classifier_fp16.tflite` exists in `assets/models/`
  - Check file path in server.py (should be relative to project root)

**Problem:** `Error loading labels: ...`
- **Solution:**
  - Verify `labels.txt` exists in `assets/models/`
  - Check that labels.txt has exactly 5 lines (one label per line)

### App Connection Issues

**Problem:** "Failed to predict: Network request failed"
- **Solution:**
  - Verify server is running (`http://localhost:5000/health`)
  - Check SERVER_URL matches your setup (localhost for simulator, IP for device)
  - For physical device: ensure same WiFi network
  - Check firewall isn't blocking port 5000

**Problem:** "Server error: 500"
- **Solution:**
  - Check server terminal for error messages
  - Verify model file is valid TensorFlow Lite format
  - Check server logs for preprocessing errors

### Model Output Issues

**Problem:** Wrong predictions or low confidence
- **Solution:**
  - Verify input preprocessing matches model expectations (224x224, normalized)
  - Check that labels.txt order matches model output indices
  - Test with known good images first

## Quick Test Checklist

- [ ] Server starts without errors
- [ ] Health endpoint returns OK
- [ ] Model loads successfully (check server logs)
- [ ] Labels load correctly (check server logs)
- [ ] App connects to server
- [ ] Single image prediction works
- [ ] Folder prediction works
- [ ] All 5 cell types can be predicted
- [ ] Confidence scores are reasonable (0-1 range)
- [ ] UI displays correctly for all cell types
- [ ] Summary card shows correct counts

## Testing with Sample Images

If you don't have cervical cell images yet, you can:
1. Use any test images to verify the pipeline works
2. The model will still make predictions (may not be accurate)
3. Focus on testing the app functionality first, then use real cervical cell images

## Next Steps

Once basic testing passes:
1. Test with real cervical cell images
2. Verify predictions match expected cell types
3. Check confidence scores are reasonable
4. Test edge cases (very large images, different formats, etc.)

