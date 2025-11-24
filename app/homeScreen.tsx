import React, { useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
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

const SERVER_URL = "http://172.20.10.2:5000"; // Replace with your server IP or ngrok URL

const HomeScreen: React.FC = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [snackbarVisible, setSnackbarVisible] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>("");
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedPrediction, setSelectedPrediction] =
    useState<Prediction | null>(null);

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

  // Predict selected images
  const predictAll = async () => {
    if (!images.length) {
      setSnackbarMessage("No images selected");
      setSnackbarVisible(true);
      return;
    }
    setLoading(true);
    const newPredictions: Prediction[] = [];
    for (const { uri } of images) {
      try {
        const formData = new FormData();
        formData.append("image", {
          uri,
          name: "image.jpeg",
          type: "image/jpeg",
        } as any);
        const response = await fetch(`${SERVER_URL}/predict`, {
          method: "POST",
          body: formData,
          headers: { "Content-Type": "multipart/form-data" },
        });
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
    }
    setPredictions(newPredictions);
    setLoading(false);
    setSnackbarMessage("Predictions completed");
    setSnackbarVisible(true);
  };

  // Predict folder on server
  const predictFolder = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/predict_folder`, {
        method: "POST",
      });
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
      <Card style={styles.card} mode="elevated">
        <Card.Content style={styles.cardContent}>
          {item.uri && (
            <View style={styles.imageContainer}>
              <Image source={{ uri: item.uri }} style={styles.image} />
              {!item.error && (
                <View
                  style={[
                    styles.badge,
                    item.classLabel === "Parasitized"
                      ? styles.badgeParasitized
                      : styles.badgeUninfected,
                  ]}
                >
                  <Icon
                    source={
                      item.classLabel === "Parasitized"
                        ? "alert-circle"
                        : "check-circle"
                    }
                    size={18}
                    color={
                      item.classLabel === "Parasitized" ? "#DC2626" : "#059669"
                    }
                  />
                </View>
              )}
            </View>
          )}
          {item.error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Error: {item.error}</Text>
            </View>
          ) : (
            <View style={styles.predictionInfo}>
              <Text
                style={[
                  styles.previewText,
                  item.classLabel === "Parasitized"
                    ? styles.parasitizedText
                    : styles.uninfectedText,
                ]}
              >
                {item.classLabel ?? "Unknown"}
              </Text>
              <Text style={[styles.confidenceText, { marginTop: 4 }]}>
                {item.confidence !== undefined
                  ? (item.confidence * 100).toFixed(1)
                  : "N/A"}
                % confidence
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content title="HopeLens" titleStyle={styles.appbarTitle} />
        <Appbar.Action icon="refresh" onPress={reset} color="#FFFFFF" />
      </Appbar.Header>
      <Card style={styles.card}>
        <Card.Title
          title="Analyze Blood Images"
          subtitle="Select images or process micrographs folder"
          titleStyle={styles.cardTitle}
          subtitleStyle={styles.cardSubtitle}
        />
        <Card.Content>
          <View style={styles.buttonContainer}>
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
                Predict Selected
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
              Predict Folder
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
                Processing images...
              </Text>
            </View>
          )}
          {predictions.length > 0 && (
            <Card style={styles.summaryCard} mode="outlined">
              <Card.Content>
                <Text variant="titleLarge" style={styles.summaryTitle}>
                  Analysis Summary
                </Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total Images</Text>
                    <Text style={[styles.summaryValue, { marginTop: 8 }]}>
                      {predictions.length}
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Parasitized</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        styles.parasitizedValue,
                        { marginTop: 8 },
                      ]}
                    >
                      {
                        predictions.filter(
                          (p) => p.classLabel === "Parasitized"
                        ).length
                      }
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Uninfected</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        styles.uninfectedValue,
                        { marginTop: 8 },
                      ]}
                    >
                      {
                        predictions.filter((p) => p.classLabel === "Uninfected")
                          .length
                      }
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}
        </Card.Content>
      </Card>
      <FlatList
        data={predictions}
        renderItem={renderItem}
        keyExtractor={(item) => item.uri}
        style={styles.list}
      />
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
                      <Text
                        style={[
                          styles.modalClassLabel,
                          selectedPrediction.classLabel === "Parasitized"
                            ? styles.modalParasitized
                            : styles.modalUninfected,
                        ]}
                      >
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
    backgroundColor: "#FAFAFA",
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
  card: {
    margin: 16,
    marginBottom: 12,
    elevation: 2,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  cardContent: {
    paddingVertical: 8,
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
  summaryCard: {
    marginTop: 16,
    borderRadius: 16,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  summaryTitle: {
    color: "#1F2937",
    marginBottom: 16,
    fontWeight: "700",
    fontSize: 18,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  summaryLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    color: "#1F2937",
    fontSize: 24,
    fontWeight: "700",
  },
  parasitizedValue: {
    color: "#DC2626",
  },
  uninfectedValue: {
    color: "#059669",
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 8,
  },
  imageContainer: {
    position: "relative",
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F9FAFB",
  },
  image: {
    width: "100%",
    height: 120,
    resizeMode: "cover",
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  badgeParasitized: {
    backgroundColor: "#FEE2E2",
  },
  badgeUninfected: {
    backgroundColor: "#D1FAE5",
  },
  predictionInfo: {
    marginTop: 4,
  },
  previewText: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  parasitizedText: {
    color: "#DC2626",
  },
  uninfectedText: {
    color: "#059669",
  },
  confidenceText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
  },
  errorContainer: {
    paddingVertical: 8,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "500",
  },
  fab: {
    position: "absolute",
    margin: 20,
    right: 0,
    bottom: 0,
    backgroundColor: "#2563EB",
    borderRadius: 28,
  },
  list: {
    flex: 1,
    marginHorizontal: 16,
    paddingBottom: 20,
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
  },
  modalParasitized: {
    color: "#DC2626",
  },
  modalUninfected: {
    color: "#059669",
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
