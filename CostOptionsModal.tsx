import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CostOptions } from "../state/pricingStore";

interface CostOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (options: CostOptions) => void;
  initialOptions?: Partial<CostOptions>;
}

export default function CostOptionsModal({
  visible,
  onClose,
  onConfirm,
  initialOptions = {}
}: CostOptionsModalProps) {
  const [options, setOptions] = useState<CostOptions>({
    minAccept: 0.8,
    maxConcurrent: 5,
    retries: 3,
    timeoutMs: 30000,
    currency: "USD",
    ...initialOptions
  });
  
  const handleConfirm = () => {
    onConfirm(options);
    onClose();
  };
  
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
          <Pressable onPress={onClose}>
            <Text className="text-blue-500 text-lg">Cancel</Text>
          </Pressable>
          <Text className="text-lg font-semibold">Pricing Options</Text>
          <Pressable onPress={handleConfirm}>
            <Text className="text-blue-500 text-lg font-medium">Run</Text>
          </Pressable>
        </View>
        
        <ScrollView className="flex-1 p-4">
          {/* Pricing Options Form */}
          <View className="space-y-4">
            <View>
              <Text className="font-medium text-gray-700 mb-2">Minimum Acceptance Score</Text>
              <TextInput
                value={options.minAccept.toString()}
                onChangeText={(text) => setOptions(prev => ({ 
                  ...prev, 
                  minAccept: parseFloat(text) || 0 
                }))}
                className="border border-gray-300 rounded-lg px-3 py-2"
                keyboardType="numeric"
                placeholder="0.8"
              />
            </View>
            
            <View>
              <Text className="font-medium text-gray-700 mb-2">Max Concurrent Requests</Text>
              <TextInput
                value={options.maxConcurrent.toString()}
                onChangeText={(text) => setOptions(prev => ({ 
                  ...prev, 
                  maxConcurrent: parseInt(text) || 5 
                }))}
                className="border border-gray-300 rounded-lg px-3 py-2"
                keyboardType="numeric"
                placeholder="5"
              />
            </View>
            
            <View>
              <Text className="font-medium text-gray-700 mb-2">Retries</Text>
              <TextInput
                value={options.retries.toString()}
                onChangeText={(text) => setOptions(prev => ({ 
                  ...prev, 
                  retries: parseInt(text) || 3 
                }))}
                className="border border-gray-300 rounded-lg px-3 py-2"
                keyboardType="numeric"
                placeholder="3"
              />
            </View>
            
            <View>
              <Text className="font-medium text-gray-700 mb-2">Timeout (ms)</Text>
              <TextInput
                value={options.timeoutMs.toString()}
                onChangeText={(text) => setOptions(prev => ({ 
                  ...prev, 
                  timeoutMs: parseInt(text) || 30000 
                }))}
                className="border border-gray-300 rounded-lg px-3 py-2"
                keyboardType="numeric"
                placeholder="30000"
              />
            </View>
            
            <View>
              <Text className="font-medium text-gray-700 mb-2">Currency</Text>
              <TextInput
                value={options.currency}
                onChangeText={(text) => setOptions(prev => ({ 
                  ...prev, 
                  currency: text 
                }))}
                className="border border-gray-300 rounded-lg px-3 py-2"
                placeholder="USD"
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
