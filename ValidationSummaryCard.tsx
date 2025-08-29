import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ValidationSummaryProps {
  totalItems: number;
  validatedItems: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  averageConfidence: number;
  onViewDetails?: () => void;
}

export default function ValidationSummaryCard({
  totalItems,
  validatedItems,
  criticalIssues,
  highIssues,
  mediumIssues,
  lowIssues,
  averageConfidence,
  onViewDetails
}: ValidationSummaryProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "#10B981"; // Green
    if (confidence >= 0.6) return "#F59E0B"; // Yellow
    return "#EF4444"; // Red
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High";
    if (confidence >= 0.6) return "Medium";
    return "Low";
  };

  const totalIssues = criticalIssues + highIssues + mediumIssues + lowIssues;

  return (
    <View className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-semibold text-gray-900">
          Material Validation
        </Text>
        <View 
          className="px-2 py-1 rounded-full"
          style={{ backgroundColor: `${getConfidenceColor(averageConfidence)}20` }}
        >
          <Text 
            className="text-xs font-medium"
            style={{ color: getConfidenceColor(averageConfidence) }}
          >
            {getConfidenceLabel(averageConfidence)} Confidence
          </Text>
        </View>
      </View>

      {/* Validation Stats */}
      <View className="flex-row justify-between mb-4">
        <View className="items-center">
          <Text className="text-2xl font-bold text-gray-900">{validatedItems}</Text>
          <Text className="text-xs text-gray-500">Validated</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-bold text-gray-900">{Math.round(averageConfidence * 100)}%</Text>
          <Text className="text-xs text-gray-500">Avg Confidence</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-bold text-gray-900">{totalIssues}</Text>
          <Text className="text-xs text-gray-500">Issues Found</Text>
        </View>
      </View>

      {/* Issue Breakdown */}
      {totalIssues > 0 && (
        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 mb-2">Issues by Severity</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row space-x-3">
              {criticalIssues > 0 && (
                <View className="bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                  <View className="flex-row items-center">
                    <Ionicons name="alert-circle" size={16} color="#EF4444" />
                    <Text className="text-red-700 font-medium ml-1">{criticalIssues}</Text>
                  </View>
                  <Text className="text-xs text-red-600">Critical</Text>
                </View>
              )}
              {highIssues > 0 && (
                <View className="bg-orange-50 px-3 py-2 rounded-lg border border-orange-200">
                  <View className="flex-row items-center">
                    <Ionicons name="warning" size={16} color="#F97316" />
                    <Text className="text-orange-700 font-medium ml-1">{highIssues}</Text>
                  </View>
                  <Text className="text-xs text-orange-600">High</Text>
                </View>
              )}
              {mediumIssues > 0 && (
                <View className="bg-yellow-50 px-3 py-2 rounded-lg border border-yellow-200">
                  <View className="flex-row items-center">
                    <Ionicons name="alert" size={16} color="#EAB308" />
                    <Text className="text-yellow-700 font-medium ml-1">{mediumIssues}</Text>
                  </View>
                  <Text className="text-xs text-yellow-600">Medium</Text>
                </View>
              )}
              {lowIssues > 0 && (
                <View className="bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                  <View className="flex-row items-center">
                    <Ionicons name="information-circle" size={16} color="#3B82F6" />
                    <Text className="text-blue-700 font-medium ml-1">{lowIssues}</Text>
                  </View>
                  <Text className="text-xs text-blue-600">Low</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Action Button */}
      {onViewDetails && (
        <Pressable
          onPress={onViewDetails}
          className="bg-gray-100 p-3 rounded-lg flex-row items-center justify-center"
        >
          <Ionicons name="list-outline" size={16} color="#6B7280" />
          <Text className="text-gray-700 font-medium ml-2">View Validation Details</Text>
        </Pressable>
      )}

      {/* Summary Message */}
      <View className="mt-3 p-3 bg-gray-50 rounded-lg">
        <Text className="text-sm text-gray-600">
          {totalIssues === 0 
            ? "All materials passed validation checks. No issues found."
            : `${totalIssues} validation issues found across ${validatedItems} items. Review details for recommendations.`
          }
        </Text>
      </View>
    </View>
  );
}