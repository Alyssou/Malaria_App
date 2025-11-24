import * as React from "react";
import { PaperProvider, MD3LightTheme } from "react-native-paper";
import HomeScreen from "@/app/homeScreen";

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#2563EB",
    onPrimary: "#FFFFFF",
    primaryContainer: "#DBE4FF",
    onPrimaryContainer: "#001F3F",
    secondary: "#059669",
    onSecondary: "#FFFFFF",
    secondaryContainer: "#D1FAE5",
    onSecondaryContainer: "#002E1A",
    tertiary: "#7C3AED",
    onTertiary: "#FFFFFF",
    tertiaryContainer: "#E9D5FF",
    onTertiaryContainer: "#2D0052",
    error: "#DC2626",
    onError: "#FFFFFF",
    errorContainer: "#FEE2E2",
    onErrorContainer: "#7F1D1D",
    background: "#FAFAFA",
    onBackground: "#1F2937",
    surface: "#FFFFFF",
    onSurface: "#1F2937",
    surfaceVariant: "#F3F4F6",
    onSurfaceVariant: "#6B7280",
    outline: "#D1D5DB",
    outlineVariant: "#E5E7EB",
    shadow: "#000000",
    scrim: "#000000",
    inverseSurface: "#1F2937",
    inverseOnSurface: "#FFFFFF",
    inversePrimary: "#93C5FD",
    elevation: {
      level0: "transparent",
      level1: "#FFFFFF",
      level2: "#FFFFFF",
      level3: "#FFFFFF",
      level4: "#FFFFFF",
      level5: "#FFFFFF",
    },
    surfaceDisabled: "rgba(31, 41, 55, 0.12)",
    onSurfaceDisabled: "rgba(31, 41, 55, 0.38)",
    backdrop: "rgba(0, 0, 0, 0.5)",
  },
};

const App: React.FC = () => {
  return (
    <PaperProvider theme={theme}>
      <HomeScreen />
    </PaperProvider>
  );
};

export default App;
