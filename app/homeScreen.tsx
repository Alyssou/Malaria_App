import React, { useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import {
  Appbar,
  Button,
  Card,
  Text,
  ActivityIndicator,
  FAB,
  Snackbar,
  Portal,
  Modal,
  Icon,
} from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

// Define types for predictions and images
interface Prediction {
  uri: string;
  classLabel?: string;
  confidence?: number;
  error?: string;
}

interface ImageItem {
  uri: string;
}

const SERVER_URL = "http://192.168.1.194:5000"; // Your computer's current IP address

const HomeScreen: React.FC = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [processingIndex, setProcessingIndex] = useState<number>(0);
  const [snackbarVisible, setSnackbarVisible] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>("");
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedPrediction, setSelectedPrediction] =
    useState<Prediction | null>(null);

  // Test server connection
  const testServerConnection = async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${SERVER_URL}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        setSnackbarMessage(`✅ Server connected: ${data.message}`);
        setSnackbarVisible(true);
        setLoading(false);
        return true;
      }
      setSnackbarMessage(`❌ Server returned error: ${response.status}`);
      setSnackbarVisible(true);
      setLoading(false);
      return false;
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      setSnackbarMessage(`❌ Connection failed: ${errorMsg}\n\nCheck:\n1. Server running? (python server.py)\n2. IP correct? (Current: ${SERVER_URL})\n3. Same WiFi network?\n4. Firewall allows port 5000?`);
      setSnackbarVisible(true);
      setLoading(false);
      return false;
    }
  };

  // Select images from device
  const selectImages = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setSnackbarMessage("Photo library permission denied");
        setSnackbarVisible(true);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (!result.canceled) {
        setImages(result.assets.map((asset) => ({ uri: asset.uri })));
        setPredictions([]);
        setSnackbarMessage("Images selected successfully");
        setSnackbarVisible(true);
      }
    } catch (error: any) {
      setSnackbarMessage(`Error selecting images: ${error.message}`);
      setSnackbarVisible(true);
    }
  };

  // Helper function to resize image before upload (aggressive compression for large images)
  const compressImage = async (uri: string): Promise<string> => {
    try {
      // For very large SIPAKMED images, aggressively resize to 800px max
      // This significantly reduces file size and upload time
      // The model expects 224x224, so the server will do the final resize with high quality
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }], // Resize to max 800px width (maintains aspect ratio)
        {
          compress: 0.85, // 85% quality - good balance for medical images while reducing size
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      return manipulatedImage.uri;
    } catch (error) {
      // If compression fails, return original URI
      console.warn('Image compression failed, using original:', error);
      return uri;
    }
  };

  // Helper function to create timeout fetch
  const fetchWithTimeout = async (url: string, options: any, timeout: number = 120000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout/1000}s - image may be too large or server is slow`);
      }
      throw error;
    }
  };

  // Predict selected images
  const predictAll = async () => {
    if (!images.length) {
      setSnackbarMessage("No images selected");
      setSnackbarVisible(true);
      return;
    }
    
    // Test server connection first
    setSnackbarMessage("Testing server connection...");
    setSnackbarVisible(true);
    const isConnected = await testServerConnection();
    if (!isConnected) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setProcessingIndex(0);
    const newPredictions: Prediction[] = [];
    
    for (let i = 0; i < images.length; i++) {
      const { uri } = images[i];
      setProcessingIndex(i + 1);
      
      try {
        // Compress and resize image before uploading to reduce upload time
        // Use a timeout for compression itself in case it takes too long
        let compressedUri = uri;
        try {
          setSnackbarMessage(`Compressing image ${i + 1}...`);
          setSnackbarVisible(true);
          // Add timeout for compression (10 seconds max)
          const compressionPromise = compressImage(uri);
          const timeoutPromise = new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Compression timeout')), 10000)
          );
          compressedUri = await Promise.race([compressionPromise, timeoutPromise]);
        } catch (compressionError) {
          // If compression fails or times out, use original
          console.warn('Compression failed or timed out, using original image:', compressionError);
        }
        
        setSnackbarMessage(`Uploading image ${i + 1}...`);
        setSnackbarVisible(true);
        const formData = new FormData();
        
        // Handle FormData differently for web vs mobile
        if (Platform.OS === 'web') {
          // For web, fetch the image and convert to Blob
          const imageResponse = await fetch(compressedUri);
          const blob = await imageResponse.blob();
          formData.append("image", blob, "image.jpeg");
        } else {
          // For mobile (React Native), use the URI format
          formData.append("image", {
            uri: compressedUri,
            name: "image.jpeg",
            type: "image/jpeg",
          } as any);
        }
        
        const response = await fetchWithTimeout(
          `${SERVER_URL}/predict`,
          {
            method: "POST",
            body: formData,
            // Don't set Content-Type header - let FormData set it automatically with boundary
          },
          120000 // 120 second timeout (2 minutes for very large images)
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Server error response:', errorText);
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const result = await response.json();
        
        if (result.error) {
          newPredictions.push({ uri, error: result.error });
        } else {
          newPredictions.push({
            uri,
            classLabel: result.class,
            confidence: result.confidence,
          });
        }
      } catch (error: any) {
        newPredictions.push({
          uri,
          error: `Failed to predict: ${error.message}`,
        });
      }
      
      // Update predictions incrementally so user sees progress
      setPredictions([...newPredictions]);
    }
    
    setLoading(false);
    setProcessingIndex(0);
    setSnackbarMessage("Predictions completed");
    setSnackbarVisible(true);
  };

  // Predict folder on server
  const predictFolder = async () => {
    setLoading(true);
    try {
      const response = await fetchWithTimeout(
        `${SERVER_URL}/predict_folder`,
        {
          method: "POST",
        },
        60000 // 60 second timeout for folder processing
      );
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const results = await response.json();
      const newPredictions: Prediction[] = results.map((result: any) => ({
        uri: `${SERVER_URL}/micrographs/${result.image}`,
        classLabel: result.class,
        confidence: result.confidence,
        error: result.error,
      }));
      setImages(newPredictions.map((p) => ({ uri: p.uri })));
      setPredictions(newPredictions);
      setSnackbarMessage("Folder predictions completed");
      setSnackbarVisible(true);
    } catch (error: any) {
      setPredictions([
        { uri: "", error: `Failed to predict folder: ${error.message}` },
      ]);
      setSnackbarMessage(`Error predicting folder: ${error.message}`);
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
    }
  };

  // Reset the app state
  const reset = () => {
    setImages([]);
    setPredictions([]);
    setSnackbarMessage("Reset completed");
    setSnackbarVisible(true);
  };

  // Show prediction details in modal
  const showPredictionDetails = (prediction: Prediction) => {
    setSelectedPrediction(prediction);
    setModalVisible(true);
  };

  // Render prediction cards
  const renderItem = ({ item }: { item: Prediction }) => (
    <TouchableOpacity
      onPress={() => showPredictionDetails(item)}
      activeOpacity={0.7}
    >
      <Card style={styles.predictionCard} mode="elevated">
        <Card.Content style={styles.predictionCardContent}>
          {item.uri && (
            <View style={styles.predictionImageContainer}>
              <Image source={{ uri: item.uri }} style={styles.predictionImage} />
              {!item.error && (
                <View style={styles.predictionBadge}>
                  <Icon source="check-circle" size={20} color="#FFFFFF" />
                </View>
              )}
            </View>
          )}
          {item.error ? (
            <View style={styles.predictionErrorContainer}>
              <Icon source="alert-circle" size={20} color="#DC2626" />
              <Text style={styles.predictionErrorText}>{item.error}</Text>
            </View>
          ) : (
            <View style={styles.predictionInfoContainer}>
              <Text style={styles.predictionLabel} numberOfLines={1}>
                {item.classLabel ?? "Unknown"}
              </Text>
              <View style={styles.predictionConfidenceRow}>
                <View style={styles.confidenceBar}>
                  <View 
                    style={[
                      styles.confidenceBarFill, 
                      { width: `${(item.confidence || 0) * 100}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.predictionConfidence}>
                  {(item.confidence || 0) * 100}%
                </Text>
              </View>
            </View>
          )}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="Cervical Cell Classifier" titleStyle={styles.appbarTitle} />
        <Appbar.Action icon="refresh" onPress={reset} color="#FFFFFF" />
      </Appbar.Header>
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Control Card */}
        <Card style={styles.controlCard} mode="elevated">
          <Card.Title
            title="Image Analysis"
            subtitle="Select images or process folder"
            titleStyle={styles.cardTitle}
            subtitleStyle={styles.cardSubtitle}
          />
          <Card.Content>
            <View style={styles.buttonContainer}>
              <Button
                mode="outlined"
                onPress={testServerConnection}
                style={[styles.button, { marginBottom: 12 }]}
                icon="network"
                disabled={loading}
                buttonColor="#FFFFFF"
                textColor="#2563EB"
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
              >
                Test Server Connection
              </Button>
              {images.length > 0 && (
                <Button
                  mode="contained"
                  onPress={predictAll}
                  style={[styles.button, { marginBottom: 12 }]}
                  icon="cog"
                  disabled={loading}
                  buttonColor="#2563EB"
                  textColor="#FFFFFF"
                  contentStyle={styles.buttonContent}
                  labelStyle={styles.buttonLabel}
                >
                  Analyze {images.length} Image{images.length > 1 ? 's' : ''}
                </Button>
              )}
              <Button
                mode="contained"
                onPress={predictFolder}
                style={styles.button}
                icon="folder"
                disabled={loading}
                buttonColor="#059669"
                textColor="#FFFFFF"
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
              >
                Analyze Folder
              </Button>
            </View>
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator
                  animating={true}
                  color="#2563EB"
                  size="large"
                />
                <Text style={[styles.loadingText, { marginTop: 12 }]}>
                  {images.length > 0 && processingIndex > 0
                    ? `Processing image ${processingIndex} of ${images.length}...`
                    : "Processing images..."}
                </Text>
                {images.length > 0 && processingIndex > 0 && (
                  <View style={styles.progressBarContainer}>
                    <View 
                      style={[
                        styles.progressBar, 
                        { width: `${(processingIndex / images.length) * 100}%` }
                      ]} 
                    />
                  </View>
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Summary Card */}
        {predictions.length > 0 && (
          <Card style={styles.summaryCard} mode="elevated">
            <Card.Title
              title="Summary"
              titleStyle={styles.summaryTitle}
              left={(props) => <Icon {...props} icon="chart-bar" size={24} />}
            />
            <Card.Content>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatValue}>{predictions.length}</Text>
                  <Text style={styles.summaryStatLabel}>Total</Text>
                </View>
              </View>
              <View style={styles.cellTypesGrid}>
                {["Dyskeratotic", "Koliocytotic", "Metaplastic", "Parabasal", "Superficial-Intermediate"].map((cellType) => {
                  const count = predictions.filter((p) => p.classLabel === cellType && !p.error).length;
                  return (
                    <View key={cellType} style={[styles.cellTypeChip, count > 0 && styles.cellTypeChipActive]}>
                      <Text style={[styles.cellTypeChipLabel, count > 0 && styles.cellTypeChipLabelActive]}>
                        {cellType}
                      </Text>
                      <Text style={[styles.cellTypeChipValue, count > 0 && styles.cellTypeChipValueActive]}>
                        {count}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Predictions List */}
        {predictions.length > 0 && (
          <View style={styles.predictionsSection}>
            <Text style={styles.sectionTitle}>Results</Text>
            {predictions.map((item, index) => (
              <View key={item.uri || index} style={styles.predictionCardWrapper}>
                {renderItem({ item })}
              </View>
            ))}
          </View>
        )}

        {/* Empty State */}
        {predictions.length === 0 && !loading && (
          <Card style={styles.emptyCard} mode="outlined">
            <Card.Content style={styles.emptyContent}>
              <Icon source="image-outline" size={64} color="#9CA3AF" />
              <Text style={styles.emptyText}>No predictions yet</Text>
              <Text style={styles.emptySubtext}>
                Select images and tap "Analyze" to get started
              </Text>
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      <FAB
        icon="image-plus"
        style={styles.fab}
        onPress={selectImages}
        color="#FFFFFF"
        disabled={loading}
        size="medium"
      />
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
      
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          {selectedPrediction && (
            <Card style={styles.modalCard} mode="elevated">
              <Card.Content style={styles.modalContent}>
                {selectedPrediction.uri && (
                  <View style={styles.modalImageContainer}>
                    <Image
                      source={{ uri: selectedPrediction.uri }}
                      style={styles.modalImage}
                    />
                  </View>
                )}
                {selectedPrediction.error ? (
                  <View style={styles.modalErrorContainer}>
                    <Text style={styles.modalErrorText}>Error</Text>
                    <Text style={[styles.modalErrorDetails, { marginTop: 8 }]}>
                      {selectedPrediction.error}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.modalPredictionContainer}>
                    <Text style={styles.modalTitle}>Prediction Result</Text>
                    <View style={styles.modalResultBox}>
                      <Text style={styles.modalClassLabel}>
                        {selectedPrediction.classLabel}
                      </Text>
                      <Text style={[styles.modalConfidence, { marginTop: 8 }]}>
                        Confidence:{" "}
                        {(selectedPrediction.confidence! * 100).toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                )}
                <Button
                  mode="contained"
                  onPress={() => setModalVisible(false)}
                  style={styles.modalButton}
                  buttonColor="#2563EB"
                  textColor="#FFFFFF"
                  contentStyle={styles.modalButtonContent}
                  labelStyle={styles.modalButtonLabel}
                >
                  Close
                </Button>
              </Card.Content>
            </Card>
          )}
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  appbar: {
    backgroundColor: "#2563EB",
    elevation: 0,
    shadowOpacity: 0,
  },
  appbarTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 20,
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  controlCard: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardTitle: {
    color: "#1F2937",
    fontWeight: "700",
    fontSize: 18,
  },
  cardSubtitle: {
    color: "#6B7280",
    fontSize: 14,
    marginTop: 4,
  },
  buttonContainer: {
    marginTop: 8,
  },
  button: {
    borderRadius: 12,
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
  },
  progressBarContainer: {
    width: "100%",
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    marginTop: 16,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 3,
  },
  summaryCard: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  summaryTitle: {
    color: "#1F2937",
    fontWeight: "700",
    fontSize: 18,
  },
  summaryHeader: {
    marginBottom: 16,
  },
  summaryStat: {
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
  },
  summaryStatValue: {
    color: "#2563EB",
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 4,
  },
  summaryStatLabel: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cellTypesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cellTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minWidth: "48%",
    flex: 1,
    maxWidth: "48%",
  },
  cellTypeChipActive: {
    backgroundColor: "#DBE4FF",
    borderColor: "#2563EB",
  },
  cellTypeChipLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  cellTypeChipLabelActive: {
    color: "#1E40AF",
    fontWeight: "600",
  },
  cellTypeChipValue: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  cellTypeChipValueActive: {
    color: "#2563EB",
  },
  predictionsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
    marginLeft: 4,
  },
  predictionCardWrapper: {
    marginBottom: 12,
  },
  predictionCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    overflow: "hidden",
  },
  predictionCardContent: {
    padding: 0,
  },
  predictionImageContainer: {
    position: "relative",
    width: "100%",
    height: 200,
    backgroundColor: "#F9FAFB",
  },
  predictionImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  predictionBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  predictionInfoContainer: {
    padding: 16,
  },
  predictionLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
  },
  predictionConfidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  confidenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  confidenceBarFill: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 4,
  },
  predictionConfidence: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
    minWidth: 50,
    textAlign: "right",
  },
  predictionErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FEE2E2",
    gap: 8,
  },
  predictionErrorText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  emptyCard: {
    marginTop: 32,
    borderRadius: 16,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  emptyContent: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    margin: 20,
    right: 0,
    bottom: 0,
    backgroundColor: "#2563EB",
    borderRadius: 28,
  },
  snackbar: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
  },
  modal: {
    margin: 20,
    borderRadius: 20,
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
  },
  modalContent: {
    padding: 8,
  },
  modalImageContainer: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
    backgroundColor: "#F9FAFB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modalImage: {
    width: "100%",
    height: 280,
    resizeMode: "contain",
  },
  modalErrorContainer: {
    paddingVertical: 16,
  },
  modalErrorText: {
    color: "#DC2626",
    fontSize: 18,
    fontWeight: "700",
  },
  modalErrorDetails: {
    color: "#6B7280",
    fontSize: 14,
  },
  modalPredictionContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  modalTitle: {
    color: "#1F2937",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalResultBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
  },
  modalClassLabel: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
    color: "#1F2937",
  },
  modalConfidence: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "500",
  },
  modalButton: {
    marginTop: 20,
    borderRadius: 12,
  },
  modalButtonContent: {
    paddingVertical: 6,
  },
  modalButtonLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
});

export default HomeScreen;
