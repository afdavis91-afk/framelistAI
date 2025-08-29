import React from "react";
import { View, Text, Pressable, SafeAreaView } from "react-native";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/AppNavigator";
import { usePricingStore } from "../state/pricingStore";
import PricingResultsList from "../components/pricing/PricingResultsList";

type ProjectPricingRouteProp = RouteProp<RootStackParamList, "ProjectPricing">;

export default function ProjectPricingScreen() {
  const route = useRoute<ProjectPricingRouteProp>();
  const navigation = useNavigation<any>();
  const { projectId } = route.params;
  
  const { lastResultByProject } = usePricingStore();
  const result = lastResultByProject[projectId];
  
  if (!result) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        <Ionicons name="pricetag-outline" size={48} color="#9CA3AF" />
        <Text className="text-gray-600 font-medium mt-3 text-center">
          No Pricing Results
        </Text>
        <Text className="text-gray-500 text-center mt-1">
          Run pricing analysis from Project Details to see results
        </Text>
        <Pressable
          onPress={() => navigation.navigate("ProjectDetails", { projectId })}
          className="mt-4 bg-blue-500 px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-medium">Back to Project</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PricingResultsList
        result={result}
        onLinePress={(lineIndex) => {
          // TODO: Navigate to focused audit view
          console.log("Line pressed:", lineIndex);
        }}
        onAuditPress={(lineIndex) => {
          // TODO: Navigate to audit screen
          console.log("Audit pressed:", lineIndex);
        }}
      />
    </SafeAreaView>
  );
}
