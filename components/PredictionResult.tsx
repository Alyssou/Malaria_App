import React from 'react';
import { Card, Text } from 'react-native-paper';

interface Prediction {
  classLabel: string;
  confidence: number;
}

interface Props {
  prediction: Prediction;
}

const PredictionResult: React.FC<Props> = ({ prediction }) => {
  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.title}>
          Prediction Result
        </Text>
        <Text style={styles.text}>Class: {prediction.classLabel}</Text>
        <Text style={styles.text}>Confidence: {(prediction.confidence * 100).toFixed(2)}%</Text>
      </Card.Content>
    </Card>
  );
};

const styles = {
  card: {
    elevation: 2,
    borderRadius: 8,
    backgroundColor: '#424242',
  },
  title: {
    color: '#424242',
    fontWeight: "700",
    marginBottom: 8,
  },
  text: {
    color: '#424242',
    fontSize: 16,
  },
};

export default PredictionResult;