import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
 import { Ionicons } from "@expo/vector-icons";
 import { useConstructionStore } from "../state/constructionStore";
 import { useDualPricingStore } from "../state/dualPricingStore";
 import { useSettingsStore } from "../state/settingsStore";
 import { getRegionFromState, getCostIndex } from "../pricing/catalog";


export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { constructionStandards, updateConstructionStandards } = useConstructionStore();
  const preferences = useDualPricingStore((s) => s.preferences);
  const setPreferences = useDualPricingStore((s) => s.setPreferences);
  const setLocation = useDualPricingStore((s) => s.setLocation);
  
  const [studSpacing, setStudSpacing] = useState(constructionStandards.studSpacingDefault.toString());
  const [cornerStuds, setCornerStuds] = useState(constructionStandards.cornerStudCount.toString());
  const [tStuds, setTStuds] = useState(constructionStandards.tIntersectionStudCount.toString());
  const [headerBearing, setHeaderBearing] = useState(constructionStandards.headerBearing.toString());
  
  const [studWaste, setStudWaste] = useState(constructionStandards.wasteFactors.studsPct.toString());
  const [plateWaste, setPlateWaste] = useState(constructionStandards.wasteFactors.platesPct.toString());
  const [sheathingWaste, setSheathingWaste] = useState(constructionStandards.wasteFactors.sheathingPct.toString());
  const [blockingWaste, setBlockingWaste] = useState(constructionStandards.wasteFactors.blockingPct.toString());
  const [fastenerWaste, setFastenerWaste] = useState(constructionStandards.wasteFactors.fastenersPct.toString());
  
  const [autoProcess, setAutoProcess] = useState(false);
  const [highConfidenceOnly, setHighConfidenceOnly] = useState(true);

  // Analysis settings
  const enableDrawingAnalysis = useSettingsStore((s) => s.enableDrawingAnalysis);
  const setEnableDrawingAnalysis = useSettingsStore((s) => s.setEnableDrawingAnalysis);
  const enableVisionAnalysis = useSettingsStore((s) => s.enableVisionAnalysis);
  const setEnableVisionAnalysis = useSettingsStore((s) => s.setEnableVisionAnalysis);
  
  // Pricing preferences state
  const [city, setCity] = useState(preferences.defaultLocation.city);
  const [state, setState] = useState(preferences.defaultLocation.state);
  const [enableLiveRetail, setEnableLiveRetail] = useState(preferences.enableLiveRetail);
  const [enableBaseline, setEnableBaseline] = useState(preferences.enableBaseline);
  const [confidenceThreshold, setConfidenceThreshold] = useState((preferences.confidenceThreshold * 100).toString());
  const [budgetBuffer, setBudgetBuffer] = useState(preferences.budgetBuffer.toString());
  const [showLocationModal, setShowLocationModal] = useState(false);

  const handleSaveSettings = () => {
    try {
      const updatedStandards = {
        studSpacingDefault: parseFloat(studSpacing) || 16,
        cornerStudCount: parseInt(cornerStuds) || 3,
        tIntersectionStudCount: parseInt(tStuds) || 2,
        headerBearing: parseFloat(headerBearing) || 1.5,
        wasteFactors: {
          studsPct: parseFloat(studWaste) || 10,
          platesPct: parseFloat(plateWaste) || 5,
          sheathingPct: parseFloat(sheathingWaste) || 10,
          blockingPct: parseFloat(blockingWaste) || 15,
          fastenersPct: parseFloat(fastenerWaste) || 5,
        },
      };
      
      updateConstructionStandards(updatedStandards);
      
      // Save pricing preferences
      const updatedPreferences = {
        enableLiveRetail,
        enableBaseline,
        confidenceThreshold: parseFloat(confidenceThreshold) / 100 || 0.7,
        budgetBuffer: parseFloat(budgetBuffer) || 10,
      };
      
      setPreferences(updatedPreferences);
      
      Alert.alert("Settings Saved", "Construction standards and pricing preferences have been updated.");
    } catch (error) {
      Alert.alert("Error", "Failed to save settings. Please check your inputs.");
    }
  };

  const handleLocationUpdate = () => {
    try {
      const costIndex = getCostIndex(city, state);
      const region = getRegionFromState(state);
      
      const newLocation = {
        city,
        state,
        costIndex,
        region
      };
      
      setLocation(newLocation);
      setShowLocationModal(false);
      Alert.alert("Location Updated", `Pricing location set to ${city}, ${state}`);
    } catch (error) {
      Alert.alert("Error", "Failed to update location. Please check your inputs.");
    }
  };

  const handleResetDefaults = () => {
    Alert.alert(
      "Reset to Defaults",
      "Are you sure you want to reset all settings to default values?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            setStudSpacing("16");
            setCornerStuds("3");
            setTStuds("2");
            setHeaderBearing("1.5");
            setStudWaste("10");
            setPlateWaste("5");
            setSheathingWaste("10");
            setBlockingWaste("15");
            setFastenerWaste("5");
            setAutoProcess(false);
            setHighConfidenceOnly(true);
          },
        },
      ]
    );
  };

  const SettingRow = ({ 
    title, 
    value, 
    onChangeText, 
    unit, 
    keyboardType = "numeric" 
  }: {
    title: string;
    value: string;
    onChangeText: (text: string) => void;
    unit?: string;
    keyboardType?: "numeric" | "default";
  }) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
      <Text className="text-gray-700 flex-1">{title}</Text>
      <View className="flex-row items-center">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          className="border border-gray-300 rounded px-3 py-2 text-right min-w-16"
        />
        {unit && <Text className="text-gray-500 ml-2">{unit}</Text>}
      </View>
    </View>
  );

  const SwitchRow = ({ 
    title, 
    description, 
    value, 
    onValueChange 
  }: {
    title: string;
    description?: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
      <View className="flex-1">
        <Text className="text-gray-700">{title}</Text>
        {description && (
          <Text className="text-sm text-gray-500 mt-1">{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#E5E7EB", true: "#3B82F6" }}
        thumbColor={value ? "#FFFFFF" : "#FFFFFF"}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="flex-row justify-between items-center px-4 py-3 bg-white border-b border-gray-200">
        <Text className="text-2xl font-bold text-gray-900">Settings</Text>
        <Pressable
          onPress={handleSaveSettings}
          className="bg-blue-500 px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-medium">Save</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Framing Standards */}
        <View className="bg-white mx-4 mt-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-lg font-semibold text-gray-900">Framing Standards</Text>
            <Text className="text-sm text-gray-500 mt-1">
              Default values used for takeoff calculations
            </Text>
          </View>
          
          <View className="p-4">
            <SettingRow
              title="Default Stud Spacing"
              value={studSpacing}
              onChangeText={setStudSpacing}
              unit="inches"
            />
            <SettingRow
              title="Corner Stud Count"
              value={cornerStuds}
              onChangeText={setCornerStuds}
              unit="studs"
            />
            <SettingRow
              title="T-Intersection Stud Count"
              value={tStuds}
              onChangeText={setTStuds}
              unit="studs"
            />
            <SettingRow
              title="Header Bearing"
              value={headerBearing}
              onChangeText={setHeaderBearing}
              unit="inches"
            />
          </View>
        </View>

        {/* Waste Factors */}
        <View className="bg-white mx-4 mt-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-lg font-semibold text-gray-900">Waste Factors</Text>
            <Text className="text-sm text-gray-500 mt-1">
              Percentage waste added to material quantities
            </Text>
          </View>
          
          <View className="p-4">
            <SettingRow
              title="Studs"
              value={studWaste}
              onChangeText={setStudWaste}
              unit="%"
            />
            <SettingRow
              title="Plates"
              value={plateWaste}
              onChangeText={setPlateWaste}
              unit="%"
            />
            <SettingRow
              title="Sheathing"
              value={sheathingWaste}
              onChangeText={setSheathingWaste}
              unit="%"
            />
            <SettingRow
              title="Blocking"
              value={blockingWaste}
              onChangeText={setBlockingWaste}
              unit="%"
            />
            <SettingRow
              title="Fasteners"
              value={fastenerWaste}
              onChangeText={setFastenerWaste}
              unit="%"
            />
          </View>
        </View>

        {/* Analysis */}
        <View className="bg-white mx-4 mt-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-lg font-semibold text-gray-900">Drawing Analysis</Text>
            <Text className="text-sm text-gray-500 mt-1">
              Vision-based understanding of drawings to enhance quantities
            </Text>
          </View>

          <View className="p-4">
            <SwitchRow
              title="Enable Drawing Understanding"
              description="Use AI to extract geometry from plans and reconcile quantities"
              value={enableDrawingAnalysis}
              onValueChange={setEnableDrawingAnalysis}
            />
            
            <SwitchRow
              title="Enable Vision Analysis"
              description="Use AI vision to analyze schedules, legends, and callouts"
              value={enableVisionAnalysis}
              onValueChange={setEnableVisionAnalysis}
            />
          </View>
        </View>

        {/* Processing Options */}
        <View className="bg-white mx-4 mt-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-lg font-semibold text-gray-900">Processing Options</Text>
            <Text className="text-sm text-gray-500 mt-1">
              Control how documents are processed
            </Text>
          </View>
          
          <View className="p-4">
            <SwitchRow
              title="Auto-process Documents"
              description="Automatically start takeoff when documents are uploaded"
              value={autoProcess}
              onValueChange={setAutoProcess}
            />
            <SwitchRow
              title="High Confidence Only"
              description="Only include items with high confidence scores"
              value={highConfidenceOnly}
              onValueChange={setHighConfidenceOnly}
            />
          </View>
        </View>

        {/* Pricing Preferences */}
        <View className="bg-white mx-4 mt-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-lg font-semibold text-gray-900">Pricing Preferences</Text>
            <Text className="text-sm text-gray-500 mt-1">
              Configure dual pricing system settings
            </Text>
          </View>
          
          <View className="p-4">
            {/* Location Setting */}
            <Pressable
              onPress={() => setShowLocationModal(true)}
              className="flex-row items-center justify-between py-3 border-b border-gray-100"
            >
              <View className="flex-1">
                <Text className="text-gray-700">Default Location</Text>
                <Text className="text-sm text-gray-500 mt-1">
                  {preferences.defaultLocation.city}, {preferences.defaultLocation.state}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </Pressable>

            <SwitchRow
              title="Enable Live Retail Pricing"
              description="Get real-time pricing from suppliers like Home Depot, Lowe's"
              value={enableLiveRetail}
              onValueChange={setEnableLiveRetail}
            />
            
            <SwitchRow
              title="Enable Baseline Pricing"
              description="Use RSMeans/CCI adjusted baseline pricing"
              value={enableBaseline}
              onValueChange={setEnableBaseline}
            />

            <SettingRow
              title="Confidence Threshold"
              value={confidenceThreshold}
              onChangeText={setConfidenceThreshold}
              unit="%"
            />

            <SettingRow
              title="Budget Buffer"
              value={budgetBuffer}
              onChangeText={setBudgetBuffer}
              unit="%"
            />
          </View>
        </View>

        {/* Actions */}
        <View className="p-4">
          <Pressable
            onPress={handleResetDefaults}
            className="bg-gray-500 p-4 rounded-lg flex-row items-center justify-center mb-4"
          >
            <Ionicons name="refresh-outline" size={20} color="white" />
            <Text className="text-white font-medium ml-2">Reset to Defaults</Text>
          </Pressable>
          
          <View className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={20} color="#3B82F6" />
              <View className="flex-1 ml-2">
                <Text className="text-blue-800 font-medium">About Settings</Text>
                <Text className="text-blue-700 text-sm mt-1">
                  These settings control how the AI interprets construction documents, calculates quantities, and prices materials. 
                  Adjust them based on your local building codes, practices, and market conditions.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Location Modal */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
            <Pressable onPress={() => setShowLocationModal(false)}>
              <Text className="text-blue-500 text-lg">Cancel</Text>
            </Pressable>
            <Text className="text-lg font-semibold">Set Location</Text>
            <Pressable onPress={handleLocationUpdate}>
              <Text className="text-blue-500 text-lg font-medium">Save</Text>
            </Pressable>
          </View>

          <View className="p-4">
            <Text className="text-lg font-semibold text-gray-900 mb-4">Pricing Location</Text>
            <Text className="text-sm text-gray-500 mb-4">
              Set your location for accurate cost indexing and supplier availability.
            </Text>

            <View className="mb-4">
              <Text className="text-gray-700 mb-2">City</Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="Enter city name"
                className="border border-gray-300 rounded-lg px-3 py-3 text-gray-900"
              />
            </View>

            <View className="mb-4">
              <Text className="text-gray-700 mb-2">State</Text>
              <TextInput
                value={state}
                onChangeText={setState}
                placeholder="Enter state abbreviation (e.g., CA, TX, NY)"
                className="border border-gray-300 rounded-lg px-3 py-3 text-gray-900"
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>

            <View className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <Text className="text-blue-800 font-medium mb-2">Cost Index Preview</Text>
              <Text className="text-blue-700 text-sm">
                {city && state ? 
                  `${city}, ${state} has a cost index of ${getCostIndex(city, state).toFixed(2)}x national average` :
                  "Enter city and state to see cost index"
                }
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}