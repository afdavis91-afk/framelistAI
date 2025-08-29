import React from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PricingResult } from "../../state/pricingStore";

interface PricingResultsListProps {
  result: PricingResult;
  onLinePress?: (lineIndex: number) => void;
  onAuditPress?: (lineIndex: number) => void;
}

export default function PricingResultsList({
  result,
  onLinePress,
  onAuditPress
}: PricingResultsListProps) {
  const renderLineItem = ({ item, index }: { item: any; index: number }) => (
    <Pressable
      onPress={() => onLinePress?.(index)}
      className="bg-white p-4 rounded-lg border border-gray-200 mb-3"
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="font-medium text-gray-900 mb-1">
            {item.materialId}
          </Text>
          <View className="flex-row items-center space-x-4">
            <Text className="text-sm text-gray-600">
              ${item.unitPrice.toFixed(2)}
            </Text>
            <Text className="text-sm text-gray-500">{item.currency}</Text>
            <Text className="text-sm text-gray-500">
              Score: {item.score.toFixed(1)}
            </Text>
          </View>
          <Text className="text-xs text-gray-400 mt-1">
            {item.vendor} • {new Date(item.priceAsOfUsed).toLocaleDateString()}
          </Text>
        </View>
        
        <View className="flex-row items-center space-x-2">
          <Pressable
            onPress={() => onAuditPress?.(index)}
            className="p-2 rounded border border-gray-300"
          >
            <Ionicons name="document-text-outline" size={16} color="#6B7280" />
          </Pressable>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
  
  return (
    <View className="flex-1">
      <View className="p-4 bg-white border-b border-gray-100">
        <Text className="text-lg font-semibold text-gray-900">
          Pricing Results ({result.lines.length} items)
        </Text>
        <Text className="text-sm text-gray-500 mt-1">
          Generated {new Date(result.asOfISO).toLocaleString()}
        </Text>
      </View>
      
      <FlatList
        data={result.lines}
        keyExtractor={(item, index) => `${item.materialId}-${index}`}
        renderItem={renderLineItem}
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}
