import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

// Screens
import ProjectsScreen from "../screens/ProjectsScreen";
import ProjectDetailsScreen from "../screens/ProjectDetailsScreen";
import DocumentViewerScreen from "../screens/DocumentViewerScreen";
import TakeoffResultsScreen from "../screens/TakeoffResultsScreen";
import ProjectPricingScreen from "../screens/ProjectPricingScreen";
import SettingsScreen from "../screens/SettingsScreen";

export type RootStackParamList = {
  MainTabs: undefined;
  ProjectDetails: { projectId: string };
  DocumentViewer: { documentId: string; projectId: string };
  TakeoffResults: { takeoffId: string; projectId: string };
  ProjectPricing: { projectId: string };
};

export type TabParamList = {
  Projects: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === "Projects") {
            iconName = focused ? "folder" : "folder-outline";
          } else if (route.name === "Settings") {
            iconName = focused ? "settings" : "settings-outline";
          } else {
            iconName = "help-outline";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: "gray",
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Projects" 
        component={ProjectsScreen}
        options={{ title: "Projects" }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: "#007AFF",
          },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "600",
          },
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ProjectDetails"
          component={ProjectDetailsScreen}
          options={{ title: "Project Details" }}
        />
        <Stack.Screen
          name="DocumentViewer"
          component={DocumentViewerScreen}
          options={{ title: "Document Viewer" }}
        />
        <Stack.Screen
          name="TakeoffResults"
          component={TakeoffResultsScreen}
          options={{ title: "Takeoff Results" }}
        />
        <Stack.Screen
          name="ProjectPricing"
          component={ProjectPricingScreen}
          options={{ title: "Pricing Results" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}