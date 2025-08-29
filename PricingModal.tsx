import React from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PricingComparison } from "../../pricing/types";
import PricingComparisonCard from "./PricingComparisonCard";
import { makeComparisonTitle } from "../../pricing/label";

interface PricingModalProps {
  visible: boolean;
  onClose: () => void;
  comparison: PricingComparison | null;
  title?: string;
}

export default function PricingModal({ 
  visible, 
  onClose, 
  comparison,
  title = "Pricing Details"
}: PricingModalProps) {
  
  if (!comparison) return null;
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView className="flex-1 bg-gray-50">
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-3 bg-white border-b border-gray-200">
          <View className="flex-1">
            <Text className="text-lg font-semibold text-gray-900">{title}</Text>
            <Text className="text-sm text-gray-500">
              {makeComparisonTitle(comparison)} • {comparison.quantity} {comparison.unit}
            </Text>
          </View>
          
          <Pressable onPress={onClose} className="p-2">
            <Ionicons name="close" size={24} color="#6B7280" />
          </Pressable>
        </View>
        
        {/* Content */}
        <ScrollView className="flex-1 p-4">
          <PricingComparisonCard 
            comparison={comparison} 
            showDetails={true}
          />
          
          {/* Additional Details */}
          <View className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
            <Text className="font-semibold text-gray-900 mb-3">Supplier Quotes</Text>
            
            {comparison.liveRetail.quotes.map((quote, index) => (
              <View key={index} className="flex-row justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                <View className="flex-1">
                  <Text className="font-medium text-gray-900">{quote.supplierName}</Text>
                  <View className="flex-row items-center mt-1">
                    <View className={`w-2 h-2 rounded-full mr-2 ${
                      quote.availability === "in_stock" ? "bg-green-500" :
                      quote.availability === "limited" ? "bg-yellow-500" :
                      quote.availability === "special_order" ? "bg-orange-500" : "bg-red-500"
                    }`} />
                    <Text className="text-sm text-gray-500 capitalize">
                      {quote.availability.replace("_", " ")}
                    </Text>
                    <Text className="text-sm text-gray-400 mx-2">•</Text>
                    <Text className="text-sm text-gray-500">
                      {quote.leadTime} days
                    </Text>
                  </View>
                </View>
                
                <View className="items-end">
                  <Text className="font-semibold text-gray-900">
                    ${quote.totalPrice.toFixed(2)}
                  </Text>
                  <Text className="text-sm text-gray-500">
                    ${quote.unitPrice.toFixed(2)}/{quote.unit}
                  </Text>
                </View>
              </View>
            ))}
            
            {comparison.liveRetail.quotes.length === 0 && (
              <View className="py-8 items-center">
                <Ionicons name="information-circle-outline" size={48} color="#9CA3AF" />
                <Text className="text-gray-500 mt-2">No live quotes available</Text>
              </View>
            )}
          </View>
          
          {/* Market Analysis */}
          <View className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
            <Text className="font-semibold text-gray-900 mb-3">Market Analysis</Text>
            
            <View className="space-y-3">
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Price Range:</Text>
                <Text className="font-medium text-gray-900">
                  ${comparison.liveRetail.priceRange.min.toFixed(2)} - ${comparison.liveRetail.priceRange.max.toFixed(2)}
                </Text>
              </View>
              
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Average Price:</Text>
                <Text className="font-medium text-gray-900">
                  ${comparison.liveRetail.averagePrice.toFixed(2)}
                </Text>
              </View>
              
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Supplier Coverage:</Text>
                <Text className="font-medium text-gray-900">
                  {Math.round(comparison.liveRetail.supplierCoverage * 100)}%
                </Text>
              </View>
              
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Historical Trend:</Text>
                <View className="flex-row items-center">
                  <Ionicons 
                    name={comparison.baseline.historicalTrend.direction === "up" ? "trending-up" : 
                          comparison.baseline.historicalTrend.direction === "down" ? "trending-down" : "remove"} 
                    size={16} 
                    color={comparison.baseline.historicalTrend.direction === "up" ? "#DC2626" : 
                           comparison.baseline.historicalTrend.direction === "down" ? "#059669" : "#6B7280"} 
                  />
                  <Text className="font-medium text-gray-900 ml-1">
                    {Math.abs(comparison.baseline.historicalTrend.percentChange).toFixed(1)}% 
                    {comparison.baseline.historicalTrend.direction === "up" ? " up" : 
                     comparison.baseline.historicalTrend.direction === "down" ? " down" : " stable"}
                  </Text>
                </View>
              </View>
              
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Price Volatility:</Text>
                <View className="flex-row items-center">
                  <View className={`w-2 h-2 rounded-full mr-2 ${
                    comparison.baseline.historicalTrend.volatility < 0.2 ? "bg-green-500" :
                    comparison.baseline.historicalTrend.volatility < 0.4 ? "bg-yellow-500" : "bg-red-500"
                  }`} />
                  <Text className="font-medium text-gray-900">
                    {comparison.baseline.historicalTrend.volatility < 0.2 ? "Low" :
                     comparison.baseline.historicalTrend.volatility < 0.4 ? "Medium" : "High"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          
          {/* Location Factors */}
          <View className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
            <Text className="font-semibold text-gray-900 mb-3">Location Factors</Text>
            
            <View className="space-y-3">
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Location:</Text>
                <Text className="font-medium text-gray-900">
                  {comparison.location.city}, {comparison.location.state}
                </Text>
              </View>
              
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Cost Index:</Text>
                <Text className="font-medium text-gray-900">
                  {comparison.location.costIndex.toFixed(2)}x
                </Text>
              </View>
              
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Region:</Text>
                <Text className="font-medium text-gray-900 capitalize">
                  {comparison.location.region.replace("_", " ")}
                </Text>
              </View>
              
              <View className="flex-row justify-between">
                <Text className="text-gray-600">Seasonal Factor:</Text>
                <Text className="font-medium text-gray-900">
                  {comparison.baseline.seasonalFactor.toFixed(2)}x
                </Text>
              </View>
            </View>
          </View>
          
          {/* Bottom Spacing */}
          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}