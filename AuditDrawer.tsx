import React from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AuditBundle } from "../pipeline/audit/provider";

interface AuditDrawerProps {
  visible: boolean;
  onClose: () => void;
  auditBundle: AuditBundle | null;
}

export default function AuditDrawer({ visible, onClose, auditBundle }: AuditDrawerProps) {
  if (!auditBundle) {
    return null;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "#EF4444";
      case "high": return "#F97316";
      case "medium": return "#EAB308";
      default: return "#3B82F6";
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case "critical": return "#FEF2F2";
      case "high": return "#FFF7ED";
      case "medium": return "#FEFCE8";
      default: return "#EFF6FF";
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
          <Pressable onPress={onClose}>
            <Text className="text-blue-500 text-lg">Close</Text>
          </Pressable>
          <Text className="text-lg font-semibold">Audit Trail</Text>
          <View style={{ width: 52 }} />
        </View>

        <ScrollView className="flex-1 p-4">
          {/* Decision Summary */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-900 mb-3">Decision Summary</Text>
            <View className="bg-white p-4 rounded-lg border border-gray-200">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-medium text-gray-900">{auditBundle.decision.topic}</Text>
                <View className="flex-row items-center">
                  <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                  <Text className="text-sm text-gray-600">
                    {Math.round(auditBundle.decision.confidence * 100)}%
                  </Text>
                </View>
              </View>
              <Text className="text-sm text-gray-700 mb-2">
                Selected: {JSON.stringify(auditBundle.decision.selectedValue)}
              </Text>
              <Text className="text-xs text-gray-500 mb-2">
                {auditBundle.decision.justification}
              </Text>
              <Text className="text-xs text-gray-400">
                {new Date(auditBundle.decision.timestamp).toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Inferences */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-900 mb-3">
              Inferences ({auditBundle.inferences.length})
            </Text>
            {auditBundle.inferences.map((inference) => (
              <View 
                key={inference.id} 
                className={`p-3 rounded-lg border mb-2 ${
                  inference.isSelected 
                    ? "border-green-300 bg-green-50" 
                    : "border-gray-200 bg-white"
                }`}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    {inference.isSelected && (
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    )}
                    <Text className={`text-sm font-medium ml-1 ${
                      inference.isSelected ? "text-green-800" : "text-gray-900"
                    }`}>
                      {inference.method}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-600">
                    {Math.round(inference.confidence * 100)}%
                  </Text>
                </View>
                <Text className="text-xs text-gray-700 mb-1">
                  Value: {JSON.stringify(inference.value)}
                </Text>
                <Text className="text-xs text-gray-500">
                  {inference.explanation}
                </Text>
              </View>
            ))}
          </View>

          {/* Evidence IDs */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-900 mb-3">
              Evidence ({auditBundle.evidenceIds.length})
            </Text>
            <View className="bg-gray-50 p-3 rounded-lg">
              {auditBundle.evidenceIds.length === 0 ? (
                <Text className="text-sm text-gray-500">No evidence references</Text>
              ) : (
                auditBundle.evidenceIds.map((evidenceId) => (
                  <View key={evidenceId} className="flex-row items-center py-1">
                    <Ionicons name="document-outline" size={16} color="#6B7280" />
                    <Text className="text-sm text-gray-700 ml-2">{evidenceId}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Assumptions */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-900 mb-3">
              Assumptions ({auditBundle.assumptions.length})
            </Text>
            {auditBundle.assumptions.length === 0 ? (
              <View className="bg-gray-50 p-3 rounded-lg">
                <Text className="text-sm text-gray-500">No assumptions used</Text>
              </View>
            ) : (
              auditBundle.assumptions.map((assumption, assumptionIndex) => (
                <View key={`${assumption.key}-${assumptionIndex}`} className="bg-white p-3 rounded-lg border border-gray-200 mb-2">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="font-medium text-gray-900">{assumption.key}</Text>
                    <Text className="text-xs text-gray-600">
                      {Math.round(assumption.confidence * 100)}%
                    </Text>
                  </View>
                  <Text className="text-sm text-gray-700 mb-1">
                    Value: {JSON.stringify(assumption.value)}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    Basis: {assumption.basis}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Flags */}
          {auditBundle.flags.length > 0 && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-900 mb-3">
                Flags ({auditBundle.flags.length})
              </Text>
              {auditBundle.flags.map((flag) => (
                <View 
                  key={flag.id} 
                  className="p-3 rounded-lg border mb-2"
                  style={{ 
                    backgroundColor: getSeverityBg(flag.severity),
                    borderColor: getSeverityColor(flag.severity) + "40"
                  }}
                >
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-row items-center flex-1">
                      <Ionicons 
                        name={flag.resolved ? "checkmark-circle" : "warning"} 
                        size={16} 
                        color={flag.resolved ? "#10B981" : getSeverityColor(flag.severity)} 
                      />
                      <Text 
                        className="text-sm font-medium ml-2 flex-1"
                        style={{ color: getSeverityColor(flag.severity) }}
                      >
                        {flag.type}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <Text 
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ 
                          backgroundColor: getSeverityColor(flag.severity) + "20",
                          color: getSeverityColor(flag.severity)
                        }}
                      >
                        {flag.severity}
                      </Text>
                    </View>
                  </View>
                  <Text 
                    className="text-sm"
                    style={{ color: getSeverityColor(flag.severity) }}
                  >
                    {flag.message}
                  </Text>
                  {flag.resolved && (
                    <Text className="text-xs text-green-600 mt-1">✓ Resolved</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}