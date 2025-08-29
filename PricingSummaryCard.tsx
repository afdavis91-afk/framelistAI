import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface PricingSummaryCardProps {
  totalItems: number;
  averageSavings: number;
  recommendedTotal: number;
  liveRetailTotal: number;
  baselineTotal: number;
  onViewDetails?: () => void;
}

export default function PricingSummaryCard({
  totalItems,
  averageSavings,
  recommendedTotal,
  liveRetailTotal,
  baselineTotal,
  onViewDetails
}: PricingSummaryCardProps) {
  
  const savingsAmount = Math.max(liveRetailTotal, baselineTotal) - recommendedTotal;
  const savingsColor = averageSavings > 0 ? "text-green-600" : averageSavings < 0 ? "text-red-600" : "text-gray-600";
  const savingsIcon = averageSavings > 0 ? "trending-down" : averageSavings < 0 ? "trending-up" : "remove";
  
  return (
    <View className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-lg font-semibold text-gray-900">Pricing Summary</Text>
          <Text className="text-sm text-gray-500">{totalItems} line items analyzed</Text>
        </View>
        
        {onViewDetails && (
          <Pressable
            onPress={onViewDetails}
            className="px-3 py-1 rounded-full border border-blue-500"
          >
            <Text className="text-sm text-blue-600 font-medium">View Details</Text>
          </Pressable>
        )}
      </View>
      
      {/* Cost Breakdown */}
      <View className="space-y-3">
        {/* Recommended Total */}
        <View className="flex-row items-center justify-between p-3 bg-blue-50 rounded-lg">
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-full bg-blue-500 mr-3" />
            <Text className="font-semibold text-blue-900">Recommended Total</Text>
          </View>
          <Text className="text-lg font-bold text-blue-900">
            ${recommendedTotal.toFixed(2)}
          </Text>
        </View>
        
        {/* Live Retail Total */}
        <View className="flex-row items-center justify-between p-3 bg-gray-50 rounded-lg">
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-full bg-purple-500 mr-3" />
            <Text className="font-medium text-gray-700">Live Retail Total</Text>
          </View>
          <Text className="text-lg font-semibold text-gray-900">
            ${liveRetailTotal.toFixed(2)}
          </Text>
        </View>
        
        {/* Baseline Total */}
        <View className="flex-row items-center justify-between p-3 bg-gray-50 rounded-lg">
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded-full bg-green-500 mr-3" />
            <Text className="font-medium text-gray-700">Baseline Total</Text>
          </View>
          <Text className="text-lg font-semibold text-gray-900">
            ${baselineTotal.toFixed(2)}
          </Text>
        </View>
      </View>
      
      {/* Savings Summary */}
      <View className="mt-4 pt-4 border-t border-gray-200">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Ionicons name={savingsIcon} size={20} color={savingsColor.includes("green") ? "#059669" : savingsColor.includes("red") ? "#DC2626" : "#6B7280"} />
            <Text className="font-medium text-gray-700 ml-2">
              {averageSavings >= 0 ? "Potential Savings" : "Additional Cost"}
            </Text>
          </View>
          
          <View className="items-end">
            <Text className={`text-lg font-bold ${savingsColor}`}>
              ${Math.abs(savingsAmount).toFixed(2)}
            </Text>
            <Text className={`text-sm ${savingsColor}`}>
              {Math.abs(averageSavings).toFixed(1)}%
            </Text>
          </View>
        </View>
        
        {averageSavings > 0 && (
          <View className="mt-2 p-2 bg-green-50 rounded">
            <Text className="text-sm text-green-700">
              Using recommended pricing could save you ${savingsAmount.toFixed(2)} compared to baseline estimates.
            </Text>
          </View>
        )}
        
        {averageSavings < -5 && (
          <View className="mt-2 p-2 bg-yellow-50 rounded">
            <Text className="text-sm text-yellow-700">
              Current market prices are higher than baseline estimates. Consider timing or alternative suppliers.
            </Text>
          </View>
        )}
      </View>
      
      {/* Quick Stats */}
      <View className="mt-4 pt-4 border-t border-gray-200">
        <View className="flex-row justify-between">
          <View className="items-center">
            <Text className="text-2xl font-bold text-blue-600">
              {Math.round((liveRetailTotal < baselineTotal ? liveRetailTotal / (liveRetailTotal + baselineTotal) : baselineTotal / (liveRetailTotal + baselineTotal)) * 100)}%
            </Text>
            <Text className="text-xs text-gray-500 text-center">Items favor{"\n"}live retail</Text>
          </View>
          
          <View className="items-center">
            <Text className="text-2xl font-bold text-green-600">
              {Math.round(((recommendedTotal > 0 ? 1 : 0) * 100))}%
            </Text>
            <Text className="text-xs text-gray-500 text-center">Pricing{"\n"}confidence</Text>
          </View>
          
          <View className="items-center">
            <Text className="text-2xl font-bold text-purple-600">
              {totalItems}
            </Text>
            <Text className="text-xs text-gray-500 text-center">Items{"\n"}analyzed</Text>
          </View>
        </View>
      </View>
    </View>
  );
}