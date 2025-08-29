import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PricingComparison } from "../../pricing/types";
import { makeComparisonTitle } from "../../pricing/label";

interface PricingComparisonCardProps {
  comparison: PricingComparison;
  onPress?: () => void;
  showDetails?: boolean;
}

export default function PricingComparisonCard({ 
  comparison, 
  onPress,
  showDetails = false 
}: PricingComparisonCardProps) {
  const [expanded, setExpanded] = useState(showDetails);
  
  const { liveRetail, baseline, delta, recommendation } = comparison;
  
  // Determine which option is recommended
  const isLiveRecommended = recommendation.preferredOption === "live_retail";
  const isMixed = recommendation.preferredOption === "mixed";
  
  // Color coding based on delta
  const deltaColor = delta.direction === "live_higher" 
    ? "text-red-600" 
    : delta.direction === "baseline_higher" 
    ? "text-green-600" 
    : "text-gray-600";
  
  const deltaIcon = delta.direction === "live_higher" 
    ? "trending-up" 
    : delta.direction === "baseline_higher" 
    ? "trending-down" 
    : "remove";
  
  const confidenceColor = comparison.overallConfidence >= 0.8 
    ? "text-green-600" 
    : comparison.overallConfidence >= 0.6 
    ? "text-yellow-600" 
    : "text-red-600";
  
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      setExpanded(!expanded);
    }
  };
  
  return (
    <Pressable
      onPress={handlePress}
      className="bg-white rounded-lg border border-gray-200 mb-3 overflow-hidden"
    >
      {/* Header */}
      <View className="p-4">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1">
            <Text className="font-semibold text-gray-900 mb-1">
              {makeComparisonTitle(comparison)}
            </Text>
            <Text className="text-sm text-gray-500">
              {comparison.quantity} {comparison.unit} • {comparison.location.city}, {comparison.location.state}
            </Text>
          </View>
          
          <View className="items-end">
            <View className={`px-2 py-1 rounded-full ${
              isLiveRecommended ? "bg-blue-100" : 
              isMixed ? "bg-yellow-100" : "bg-green-100"
            }`}>
              <Text className={`text-xs font-medium ${
                isLiveRecommended ? "text-blue-700" : 
                isMixed ? "text-yellow-700" : "text-green-700"
              }`}>
                {isLiveRecommended ? "Live Retail" : 
                 isMixed ? "Mixed" : "Baseline"}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Price Comparison */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center mb-1">
              <Text className="text-lg font-bold text-gray-900">
                ${Math.min(
                  Number.isFinite(liveRetail.bestQuote?.totalPrice) ? liveRetail.bestQuote.totalPrice : 0,
                  Number.isFinite(baseline.cciAdjustedPrice) ? baseline.cciAdjustedPrice : 0
                ).toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-500 ml-2">best price</Text>
            </View>
            
            <View className="flex-row items-center">
              <Ionicons name={deltaIcon} size={16} color={deltaColor.includes("red") ? "#DC2626" : deltaColor.includes("green") ? "#059669" : "#6B7280"} />
              <Text className={`text-sm ml-1 ${deltaColor}`}>
                {Number.isFinite(delta.percentage) ? Math.abs(delta.percentage).toFixed(1) : "0.0"}% difference
              </Text>
            </View>
          </View>
          
          <View className="items-end">
            <View className="flex-row items-center mb-1">
              <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              <Text className={`text-sm font-medium ${confidenceColor}`}>
                {Math.round(comparison.overallConfidence * 100)}% confidence
              </Text>
            </View>
            
            <Text className="text-xs text-gray-500">
              {liveRetail.quotes.length} suppliers
            </Text>
          </View>
        </View>
      </View>
      
      {/* Expanded Details */}
      {expanded && (
        <View className="border-t border-gray-100">
          {/* Live Retail Section */}
          <View className="p-4 bg-blue-50">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-semibold text-blue-900">Live Retail Pricing</Text>
              <Text className="text-lg font-bold text-blue-900">
                ${Number.isFinite(liveRetail.bestQuote?.totalPrice) ? liveRetail.bestQuote.totalPrice.toFixed(2) : "0.00"}
              </Text>
            </View>
            
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-blue-700">Best Supplier:</Text>
              <Text className="text-sm font-medium text-blue-900">
                {liveRetail.bestQuote?.supplierName || "N/A"}
              </Text>
            </View>
            
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-blue-700">Availability:</Text>
              <View className="flex-row items-center">
                <View className={`w-2 h-2 rounded-full mr-1 ${
                  liveRetail.marketAvailability === "in_stock" ? "bg-green-500" :
                  liveRetail.marketAvailability === "limited" ? "bg-yellow-500" :
                  liveRetail.marketAvailability === "special_order" ? "bg-orange-500" : "bg-red-500"
                }`} />
                <Text className="text-sm text-blue-900 capitalize">
                  {liveRetail.marketAvailability.replace("_", " ")}
                </Text>
              </View>
            </View>
            
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-blue-700">Lead Time:</Text>
              <Text className="text-sm text-blue-900">
                {Number.isFinite(liveRetail.bestQuote?.leadTime) ? liveRetail.bestQuote.leadTime : 0} days
              </Text>
            </View>
          </View>
          
          {/* Baseline Section */}
          <View className="p-4 bg-green-50">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-semibold text-green-900">RSMeans Baseline</Text>
              <Text className="text-lg font-bold text-green-900">
                ${Number.isFinite(baseline.cciAdjustedPrice) ? baseline.cciAdjustedPrice.toFixed(2) : "0.00"}
              </Text>
            </View>
            
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-green-700">Base Price:</Text>
              <Text className="text-sm text-green-900">
                ${Number.isFinite(baseline.rsMeansPrice) ? baseline.rsMeansPrice.toFixed(2) : "0.00"}
              </Text>
            </View>
            
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-green-700">CCI Adjustment:</Text>
              <Text className="text-sm text-green-900">
                {((comparison.location.costIndex - 1) * 100).toFixed(1)}%
              </Text>
            </View>
            
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-green-700">Trend:</Text>
              <View className="flex-row items-center">
                <Ionicons 
                  name={baseline.historicalTrend.direction === "up" ? "trending-up" : 
                        baseline.historicalTrend.direction === "down" ? "trending-down" : "remove"} 
                  size={14} 
                  color={baseline.historicalTrend.direction === "up" ? "#DC2626" : 
                         baseline.historicalTrend.direction === "down" ? "#059669" : "#6B7280"} 
                />
                <Text className="text-sm text-green-900 ml-1">
                  {Number.isFinite(baseline.historicalTrend?.percentChange) ? Math.abs(baseline.historicalTrend.percentChange).toFixed(1) : "0.0"}%
                </Text>
              </View>
            </View>
            
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-green-700">Data Age:</Text>
              <Text className="text-sm text-green-900">
                {baseline.dataAge} days
              </Text>
            </View>
          </View>
          
          {/* Recommendation Section */}
          <View className="p-4 bg-gray-50">
            <Text className="font-semibold text-gray-900 mb-2">Recommendation</Text>
            
            {recommendation.reasoning.map((reason, index) => (
              <View key={index} className="flex-row items-start mb-1">
                <Text className="text-gray-500 mr-2">•</Text>
                <Text className="text-sm text-gray-700 flex-1">{reason}</Text>
              </View>
            ))}
            
            {recommendation.riskFactors.length > 0 && (
              <View className="mt-3">
                <Text className="font-medium text-orange-700 mb-1">Risk Factors:</Text>
                {recommendation.riskFactors.map((risk, index) => (
                  <View key={index} className="flex-row items-start mb-1">
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text className="text-sm text-orange-700 ml-1 flex-1">{risk}</Text>
                  </View>
                ))}
              </View>
            )}
            
            {recommendation.alternativeActions.length > 0 && (
              <View className="mt-3">
                <Text className="font-medium text-blue-700 mb-1">Suggested Actions:</Text>
                {recommendation.alternativeActions.map((action, index) => (
                  <View key={index} className="flex-row items-start mb-1">
                    <Ionicons name="bulb" size={14} color="#3B82F6" />
                    <Text className="text-sm text-blue-700 ml-1 flex-1">{action}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
      
      {/* Expand/Collapse Indicator */}
      {!onPress && (
        <View className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <View className="flex-row items-center justify-center">
            <Ionicons 
              name={expanded ? "chevron-up" : "chevron-down"} 
              size={16} 
              color="#6B7280" 
            />
            <Text className="text-xs text-gray-500 ml-1">
              {expanded ? "Show Less" : "Show Details"}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}