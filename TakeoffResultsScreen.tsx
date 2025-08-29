 import React, { useState, useEffect, useMemo } from "react";
 import { View, Text, Pressable, Modal, Switch, FlatList, ScrollView, TextInput } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useConstructionStore } from "../state/constructionStore";
import { exportService, ExportOptions } from "../services/exportService";
import LineItemCard from "../components/LineItemCard";
import * as Sharing from "expo-sharing";
// REMOVED: Pricing imports - now handled in Project Details
import { TakeoffLineItem, StepTraceEvent } from "../types/construction";
import { useNetInfo } from "@react-native-community/netinfo";
import { enableAuditTrail } from "../pipeline/featureFlags";
import { getAuditBundle, AuditBundle } from "../pipeline/audit/provider";
import AuditDrawer from "../components/AuditDrawer";

type TakeoffResultsRouteProp = RouteProp<RootStackParamList, "TakeoffResults">;

interface MaterialCategory {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  keywords: string[];
}

const MATERIAL_CATEGORIES: MaterialCategory[] = [
  {
    id: "framing",
    name: "Framing",
    icon: "grid-outline",
    color: "#3B82F6",
    keywords: ["stud", "plate", "joist", "rafter", "beam", "header", "post", "column"]
  },
  {
    id: "sheathing",
    name: "Sheathing",
    icon: "layers-outline",
    color: "#10B981",
    keywords: ["sheathing", "plywood", "osb", "drywall", "gypsum"]
  },
  {
    id: "connectors",
    name: "Connectors",
    icon: "link-outline",
    color: "#F59E0B",
    keywords: ["hanger", "connector", "strap", "tie", "anchor", "bolt"]
  },
  {
    id: "fasteners",
    name: "Fasteners",
    icon: "hammer-outline",
    color: "#EF4444",
    keywords: ["nail", "screw", "fastener", "staple"]
  },
  {
    id: "blocking",
    name: "Blocking",
    icon: "cube-outline",
    color: "#8B5CF6",
    keywords: ["blocking", "bridging", "backing"]
  },
  {
    id: "openings",
    name: "Openings",
    icon: "square-outline",
    color: "#06B6D4",
    keywords: ["door", "window", "opening", "rough opening"]
  },
  {
    id: "other",
    name: "Other",
    icon: "ellipsis-horizontal",
    color: "#6B7280",
    keywords: []
  }
];

type SortType = "default" | "quantity" | "confidence" | "material" | "category";

// Enhanced categorization function
function getCategoryFromScope(scope: string): MaterialCategory {
  const lowerScope = scope.toLowerCase();
  
  for (const category of MATERIAL_CATEGORIES.slice(0, -1)) { // Exclude "Other"
    if (category.keywords.some(keyword => lowerScope.includes(keyword))) {
      return category;
    }
  }
  
  return MATERIAL_CATEGORIES[MATERIAL_CATEGORIES.length - 1]; // Return "Other"
}

export default function TakeoffResultsScreen() {
  const route = useRoute<TakeoffResultsRouteProp>();
  const navigation = useNavigation<any>();
  const { takeoffId, projectId } = route.params;
  const netInfo = useNetInfo();
  
   const { projects, processingTraces } = useConstructionStore();
   const updateTakeoff = useConstructionStore((s) => s.updateTakeoff);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "json",
    includeEvidence: true,
    includeAssumptions: true,
    includeFlags: true,
  });
  const [isExporting, setIsExporting] = useState(false);
  // REMOVED: showAllComparisons - no longer needed
  
  // Filtering and sorting state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [selectedUOM, setSelectedUOM] = useState<string>("all");
  const [searchText, setSearchText] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortType>("default");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedNormalizationConfidence, setSelectedNormalizationConfidence] = useState<string>("all");


  // Result feedback modal
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultTitle, setResultTitle] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const openResult = (t: string, m: string) => { setResultTitle(t); setResultMessage(m); setShowResultModal(true); };
   const [showTraceModal, setShowTraceModal] = useState(false);
   const [showDecisionsModal, setShowDecisionsModal] = useState(false);

  // Audit drawer state
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [selectedAuditBundle, setSelectedAuditBundle] = useState<AuditBundle | null>(null);


  // REMOVED: Pricing state - now handled in Project Details
  
  const project = projects.find(p => p.id === projectId);
  const takeoff = project?.takeoffs.find(t => t.id === takeoffId);
  const allItems = Array.isArray(takeoff?.lineItems)
    ? takeoff!.lineItems
    : Array.isArray((takeoff as any)?.takeoff)
    ? ((takeoff as any).takeoff as any[])
    : [];
   const flagsSafe = Array.isArray(takeoff?.flags) ? takeoff!.flags : [];
   const flagsView = flagsSafe.map((f) => ({ ...f, sheets: Array.isArray(f.sheets) ? f.sheets : [] }));
   const decisions = Array.isArray((takeoff as any)?.decisions) ? (takeoff as any).decisions as any[] : [];


  // Aggregate recent traces for project documents
  const projectDocIds = (project?.documents || []).map(d => d.id);
  const traceEvents: StepTraceEvent[] = projectDocIds.flatMap(id => processingTraces[id] || []).slice(-50);

  // Filtered and sorted items
  const filteredAndSortedItems = useMemo(() => {
    let filtered = [...allItems];

    if (selectedCategory !== "all") {
      filtered = filtered.filter(item => {
        const category = getCategoryFromScope(item.context.scope);
        return category.id === selectedCategory;
      });
    }

    if (minConfidence > 0) {
      filtered = filtered.filter(item => item.confidence >= minConfidence);
    }

     if (selectedUOM !== "all") {
       filtered = filtered.filter(item => item.uom === selectedUOM);
     }

     if (selectedLevel !== "all") {
       filtered = filtered.filter(item => (item.context.level || "").toLowerCase() === selectedLevel.toLowerCase());
     }

     // Filter by normalization confidence
     if (selectedNormalizationConfidence !== "all") {
       filtered = filtered.filter(item => {
         try {
           const normalized = require('../pricing/MaterialSpecNormalizer').MaterialSpecNormalizer.normalizeSpec(item.material.spec);
           switch (selectedNormalizationConfidence) {
             case "high":
               return normalized.confidence >= 0.8;
             case "medium":
               return normalized.confidence >= 0.6 && normalized.confidence < 0.8;
             case "low":
               return normalized.confidence < 0.6;
             default:
               return true;
           }
         } catch {
           return selectedNormalizationConfidence === "low"; // Failed normalization counts as low
         }
       });
     }


    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(item => 
        item.material.spec.toLowerCase().includes(search) ||
        item.context.scope.toLowerCase().includes(search) ||
        item.material.size?.toLowerCase().includes(search) ||
        item.material.species?.toLowerCase().includes(search)
      );
    }

    switch (sortBy) {
      case "quantity":
        filtered.sort((a, b) => b.qty - a.qty);
        break;
      case "confidence":
        filtered.sort((a, b) => b.confidence - a.confidence);
        break;
      case "material":
        filtered.sort((a, b) => a.material.spec.localeCompare(b.material.spec));
        break;
      case "category":
        filtered.sort((a, b) => {
          const catA = getCategoryFromScope(a.context.scope);
          const catB = getCategoryFromScope(b.context.scope);
          return catA.name.localeCompare(catB.name);
        });
        break;
      default:
        break;
    }

    return filtered;
  }, [allItems, selectedCategory, minConfidence, selectedUOM, searchText, sortBy]);

   const availableUOMs = useMemo(() => {
     const uoms = new Set(allItems.map(item => item.uom));
     return Array.from(uoms).sort();
   }, [allItems]);

   const availableLevels = useMemo(() => {
     const counts = new Map<string, number>();
     allItems.forEach((it) => {
       const lvl = (it.context.level || "UNKNOWN");
       counts.set(lvl, (counts.get(lvl) || 0) + 1);
     });
     return Array.from(counts.entries());
   }, [allItems]);


  // REMOVED: Pricing loading logic - now handled in Project Details

   const handleExport = async () => {
     if (!takeoff || !project) return;
     try {
       setIsExporting(true);
       await exportService.exportTakeoff(takeoff, project, exportOptions);
       setShowExportModal(false);
       openResult("Export Complete", "Takeoff has been exported successfully.");
     } catch (error) {
       openResult("Export Failed", "Failed to export takeoff. Please try again.");
     } finally {
       setIsExporting(false);
     }
   };

   const setFieldByPath = (obj: any, path: string, value: any) => {
     const parts = path.split(".");
     let target = obj;
     for (let i = 0; i < parts.length - 1; i++) {
       if (target[parts[i]] == null) return;
       target = target[parts[i]];
     }
     if (value === undefined) {
       try { delete target[parts[parts.length - 1]]; } catch {}
     } else {
       target[parts[parts.length - 1]] = value;
     }
   };

   const undoDecision = (decisionId: string) => {
     if (!takeoff) return;
     const currentDecisions = decisions.slice();
     const decision = currentDecisions.find((d) => d.id === decisionId);
     if (!decision) return;
     const items = [...takeoff.lineItems.map((it) => ({ ...it, material: { ...it.material }, context: { ...it.context }, assumptions: [...it.assumptions] }))];
     const idx = items.findIndex((it) => it.itemId === decision.itemId);
     if (idx >= 0) {
       setFieldByPath(items[idx] as any, decision.field, decision.from);
     }
     const nextDecisions = currentDecisions.filter((d) => d.id !== decisionId);
     updateTakeoff(takeoffId, { lineItems: items, decisions: nextDecisions });
   };

   const undoAllDecisions = () => {
     if (!takeoff) return;
     let items = [...takeoff.lineItems.map((it) => ({ ...it, material: { ...it.material }, context: { ...it.context }, assumptions: [...it.assumptions] }))];
     decisions.forEach((decision) => {
       const idx = items.findIndex((it) => it.itemId === decision.itemId);
       if (idx >= 0) setFieldByPath(items[idx] as any, decision.field, decision.from);
     });
     updateTakeoff(takeoffId, { lineItems: items, decisions: [] });
   };

   // Handle audit button press
   const handleAuditPress = async (item: TakeoffLineItem) => {
     if (!item.auditRef) return;
     
     try {
       // Use takeoffId as runId for now - in a real implementation this would come from the takeoff metadata
       const auditBundle = await getAuditBundle(takeoffId, item.auditRef.decisionId);
       if (auditBundle) {
         setSelectedAuditBundle(auditBundle);
         setShowAuditDrawer(true);
       }
     } catch (error) {
       console.error("Failed to load audit bundle:", error);
     }
   };


  if (!takeoff) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        <Text className="text-gray-500">Takeoff not found</Text>
      </SafeAreaView>
    );
  }

  const Header = (
    <>
      {/* Offline Notice */}
      {!netInfo.isConnected && (
        <View className="bg-yellow-50 p-3 mx-4 mt-4 rounded-lg border border-yellow-200">
          <View className="flex-row items-center">
            <Ionicons name="cloud-offline" size={18} color="#EAB308" />
            <Text className="text-yellow-800 font-medium ml-2">Offline</Text>
          </View>
          <Text className="text-yellow-700 text-sm mt-1">Reconnect to reprocess or export.</Text>
        </View>
      )}

       {/* Takeoff Header */}
       <View className="bg-white p-4 border-b border-gray-200">
         <View className="flex-row justify-between items-center">
           <View>
             <Text className="text-lg font-semibold text-gray-900 mb-2">Takeoff Results</Text>
             <View className="flex-row items-center">
               <Text className="text-sm text-gray-500">
                 {filteredAndSortedItems.length} of {allItems.length} line items
               </Text>
               <Text className="text-sm text-gray-400 mx-2">•</Text>
                <Text className="text-sm text-gray-500">{Number.isFinite(takeoff.confidence) ? Math.round(takeoff.confidence * 100) : 0}% confidence</Text>
             </View>
           </View>
           <View className="flex-row items-center">
             {decisions.length > 0 && (
               <Pressable onPress={() => setShowDecisionsModal(true)} className="px-3 py-2 rounded border border-blue-300 mr-2" style={{ backgroundColor: "#EFF6FF" }}>
                 <Text className="text-xs" style={{ color: "#2563EB" }}>Review decisions</Text>
               </Pressable>
             )}
              <Pressable onPress={() => setShowTraceModal(true)} className="px-3 py-2 rounded border border-gray-300">
                <Text className="text-xs text-gray-700">View processing details{flagsView.length > 0 ? ` (${flagsView.length})` : ""}</Text>
              </Pressable>
           </View>
         </View>
         {decisions.length > 0 && (
           <View className="mt-3 p-3 rounded-lg border" style={{ backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }}>
             <View className="flex-row items-center justify-between">
               <View className="flex-row items-center">
                 <Ionicons name="checkmark-circle" size={18} color="#059669" />
                 <Text className="ml-2 text-green-800 font-medium">AI decisions applied</Text>
               </View>
               <Text className="text-green-700 text-xs">{decisions.length} changes</Text>
             </View>
           </View>
         )}
       </View>



      {/* NEW: Pricing Callout (replaces old pricing section) */}
      <View className="p-4">
        <View className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <View className="flex-row items-center mb-2">
            <Ionicons name="information-circle" size={20} color="#3B82F6" />
            <Text className="text-blue-800 font-medium ml-2">
              Pricing Analysis Moved
            </Text>
          </View>
          <Text className="text-blue-700 text-sm mb-3">
            Pricing analysis is now available in Project Details for better organization and project-level insights.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("ProjectDetails", { projectId })}
            className="bg-blue-500 px-4 py-2 rounded-lg self-start"
          >
            <Text className="text-white font-medium">View in Project Details</Text>
          </Pressable>
        </View>
      </View>

      {/* Material Spec Normalization Summary */}
      <View className="px-4 mb-4">
        <View className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
          <View className="flex-row items-center mb-2">
            <Ionicons name="construct" size={20} color="#059669" />
            <Text className="text-green-800 font-medium ml-2">
              Material Spec Normalization
            </Text>
          </View>
          <Text className="text-green-700 text-sm mb-3">
            Your material specs are automatically normalized for the pricing system to prevent NaN pricing issues.
          </Text>
          
          {/* Normalization Stats */}
          <View className="mb-3">
            <Text className="text-xs font-medium text-green-700 mb-2">Normalization Confidence Distribution</Text>
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-green-500 mr-2" />
                <Text className="text-sm text-green-700">
                  {filteredAndSortedItems.filter(item => {
                    try {
                      const normalized = require('../pricing/MaterialSpecNormalizer').MaterialSpecNormalizer.normalizeSpec(item.material.spec);
                      return normalized.confidence >= 0.8;
                    } catch {
                      return false;
                    }
                  }).length} High
                </Text>
              </View>
              <View className="flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-yellow-500 mr-2" />
                <Text className="text-sm text-yellow-700">
                  {filteredAndSortedItems.filter(item => {
                    try {
                      const normalized = require('../pricing/MaterialSpecNormalizer').MaterialSpecNormalizer.normalizeSpec(item.material.spec);
                      return normalized.confidence >= 0.6 && normalized.confidence < 0.8;
                    } catch {
                      return false;
                    }
                  }).length} Medium
                </Text>
              </View>
              <View className="flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-red-500 mr-2" />
                <Text className="text-sm text-red-700">
                  {filteredAndSortedItems.filter(item => {
                    try {
                      const normalized = require('../pricing/MaterialSpecNormalizer').MaterialSpecNormalizer.normalizeSpec(item.material.spec);
                      return normalized.confidence < 0.6;
                    } catch {
                      return false;
                    }
                  }).length} Low
                </Text>
              </View>
            </View>
            
            {/* Progress Bar */}
            <View className="mt-2 bg-gray-200 rounded-full h-2">
              <View className="flex-row h-2 rounded-full overflow-hidden">
                <View 
                  className="bg-green-500 h-2" 
                  style={{ 
                    flex: filteredAndSortedItems.length > 0 ? 
                      filteredAndSortedItems.filter(item => {
                        try {
                          const normalized = require('../pricing/MaterialSpecNormalizer').MaterialSpecNormalizer.normalizeSpec(item.material.spec);
                          return normalized.confidence >= 0.8;
                        } catch {
                          return false;
                        }
                      }).length / filteredAndSortedItems.length : 0
                  }}
                />
                <View 
                  className="bg-yellow-500 h-2" 
                  style={{ 
                    flex: filteredAndSortedItems.length > 0 ? 
                      filteredAndSortedItems.filter(item => {
                        try {
                          const normalized = require('../pricing/MaterialSpecNormalizer').MaterialSpecNormalizer.normalizeSpec(item.material.spec);
                          return normalized.confidence >= 0.6 && normalized.confidence < 0.8;
                        } catch {
                          return false;
                        }
                      }).length / filteredAndSortedItems.length : 0
                  }}
                />
                <View 
                  className="bg-red-500 h-2" 
                  style={{ 
                    flex: filteredAndSortedItems.length > 0 ? 
                      filteredAndSortedItems.filter(item => {
                        try {
                          const normalized = require('../pricing/MaterialSpecNormalizer').MaterialSpecNormalizer.normalizeSpec(item.material.spec);
                          return normalized.confidence < 0.6;
                        } catch {
                          return false;
                        }
                      }).length / filteredAndSortedItems.length : 0
                  }}
                />
              </View>
            </View>
          </View>
          
          <Text className="text-xs text-green-600 mt-2">
            Expand any line item to see detailed normalization information and pricing impact.
          </Text>
        </View>
      </View>

      {/* Search and Filters */}
      <View className="p-4 bg-white border-b border-gray-100">
        {/* Search Bar */}
        <View className="flex-row items-center mb-3">
          <View className="flex-1 flex-row items-center bg-gray-100 rounded-lg px-3 py-2">
            <Ionicons name="search" size={20} color="#6B7280" />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search materials, specs, or scope..."
              className="flex-1 ml-2 text-base"
              placeholderTextColor="#9CA3AF"
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText("")}>
                <Ionicons name="close-circle" size={20} color="#6B7280" />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setShowFilters(!showFilters)}
            className={`ml-3 p-2 rounded-lg ${showFilters ? "bg-blue-500" : "bg-gray-200"}`}
          >
            <Ionicons 
              name="options" 
              size={20} 
              color={showFilters ? "white" : "#6B7280"} 
            />
          </Pressable>
        </View>

        {/* Filter Options */}
        {showFilters && (
          <View className="bg-gray-50 p-3 rounded-lg mb-3">
            {/* Category Filter */}
            <Text className="font-medium text-gray-700 mb-2">Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              <View className="flex-row space-x-2">
                <Pressable
                  onPress={() => setSelectedCategory("all")}
                  className={`px-3 py-2 rounded-full ${
                    selectedCategory === "all" ? "bg-blue-500" : "bg-white border border-gray-300"
                  }`}
                >
                  <Text className={`text-sm ${
                    selectedCategory === "all" ? "text-white font-medium" : "text-gray-700"
                  }`}>
                    All
                  </Text>
                </Pressable>
                {MATERIAL_CATEGORIES.map((category) => (
                  <Pressable
                    key={category.id}
                    onPress={() => setSelectedCategory(category.id)}
                    className={`px-3 py-2 rounded-full flex-row items-center ${
                      selectedCategory === category.id 
                        ? "border-2" 
                        : "bg-white border border-gray-300"
                    }`}
                    style={selectedCategory === category.id ? { 
                      backgroundColor: `${category.color}20`, 
                      borderColor: category.color 
                    } : {}}
                  >
                    <Ionicons 
                      name={category.icon} 
                      size={16} 
                      color={selectedCategory === category.id ? category.color : "#6B7280"} 
                    />
                    <Text className={`text-sm ml-1 ${
                      selectedCategory === category.id 
                        ? "font-medium" 
                        : "text-gray-700"
                    }`} style={selectedCategory === category.id ? { color: category.color } : {}}>
                      {category.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

             {/* Level Filter */}
             <Text className="font-medium text-gray-700 mb-2">Level</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
               <View className="flex-row space-x-2">
                 <Pressable
                   onPress={() => setSelectedLevel("all")}
                   className={`px-3 py-2 rounded-full ${selectedLevel === "all" ? "bg-blue-500" : "bg-white border border-gray-300"}`}
                 >
                   <Text className={`text-sm ${selectedLevel === "all" ? "text-white font-medium" : "text-gray-700"}`}>All</Text>
                 </Pressable>
                 {availableLevels.map(([lvl, count]) => (
                   <Pressable
                     key={String(lvl)}
                     onPress={() => setSelectedLevel(String(lvl))}
                     className={`px-3 py-2 rounded-full ${selectedLevel === String(lvl) ? "bg-blue-500" : "bg-white border border-gray-300"}`}
                   >
                     <Text className={`text-sm ${selectedLevel === String(lvl) ? "text-white font-medium" : "text-gray-700"}`}>{String(lvl)} ({count})</Text>
                   </Pressable>
                 ))}
               </View>
             </ScrollView>

             {/* Sort and UOM Filters */}
             <View className="flex-row space-x-4">

              <View className="flex-1">
                <Text className="font-medium text-gray-700 mb-2">Sort By</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row space-x-2">
                    {[
                      { key: "default", label: "Default" },
                      { key: "quantity", label: "Quantity" },
                      { key: "confidence", label: "Confidence" },
                      { key: "material", label: "Material" },
                      { key: "category", label: "Category" }
                    ].map((sort) => (
                      <Pressable
                        key={sort.key}
                        onPress={() => setSortBy(sort.key as SortType)}
                        className={`px-3 py-2 rounded-full ${
                          sortBy === sort.key ? "bg-blue-500" : "bg-white border border-gray-300"
                        }`}
                      >
                        <Text className={`text-sm ${
                          sortBy === sort.key ? "text-white font-medium" : "text-gray-700"
                        }`}>
                          {sort.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>

            {/* Normalization Confidence Filter */}
            <View className="mt-3">
              <Text className="font-medium text-gray-700 mb-2">Normalization Confidence</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row space-x-2">
                  <Pressable
                    onPress={() => setSelectedNormalizationConfidence("all")}
                    className={`px-3 py-2 rounded-full ${
                      selectedNormalizationConfidence === "all" ? "bg-blue-500" : "bg-white border border-gray-300"
                    }`}
                  >
                    <Text className={`text-sm ${
                      selectedNormalizationConfidence === "all" ? "text-white font-medium" : "text-gray-700"
                    }`}>
                      All
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedNormalizationConfidence("high")}
                    className={`px-3 py-2 rounded-full flex-row items-center ${
                      selectedNormalizationConfidence === "high" ? "bg-green-500" : "bg-white border border-gray-300"
                    }`}
                  >
                    <View className={`w-2 h-2 rounded-full mr-1 ${
                      selectedNormalizationConfidence === "high" ? "bg-white" : "bg-green-500"
                    }`} />
                    <Text className={`text-sm ${
                      selectedNormalizationConfidence === "high" ? "text-white font-medium" : "text-green-700"
                    }`}>
                      High (≥80%)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedNormalizationConfidence("medium")}
                    className={`px-3 py-2 rounded-full flex-row items-center ${
                      selectedNormalizationConfidence === "medium" ? "bg-yellow-500" : "bg-white border border-gray-300"
                    }`}
                  >
                    <View className={`w-2 h-2 rounded-full mr-1 ${
                      selectedNormalizationConfidence === "medium" ? "bg-white" : "bg-yellow-500"
                    }`} />
                    <Text className={`text-sm ${
                      selectedNormalizationConfidence === "medium" ? "text-white font-medium" : "text-yellow-700"
                    }`}>
                      Medium (60-79%)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedNormalizationConfidence("low")}
                    className={`px-3 py-2 rounded-full flex-row items-center ${
                      selectedNormalizationConfidence === "low" ? "bg-red-500" : "bg-white border border-gray-300"
                    }`}
                  >
                    <View className={`w-2 h-2 rounded-full mr-1 ${
                      selectedNormalizationConfidence === "low" ? "bg-white" : "bg-red-500"
                    }`} />
                    <Text className={`text-sm ${
                      selectedNormalizationConfidence === "low" ? "text-white font-medium" : "text-red-700"
                    }`}>
                      Low (&lt;60%)
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>

            {availableUOMs.length > 1 && (
              <View className="mt-3">
                <Text className="font-medium text-gray-700 mb-2">Unit of Measure</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row space-x-2">
                    <Pressable
                      onPress={() => setSelectedUOM("all")}
                      className={`px-3 py-2 rounded-full ${
                        selectedUOM === "all" ? "bg-blue-500" : "bg-white border border-gray-300"
                      }`}
                    >
                      <Text className={`text-sm ${
                        selectedUOM === "all" ? "text-white font-medium" : "text-gray-700"
                      }`}>
                        All
                      </Text>
                    </Pressable>
                    {availableUOMs.map((uom) => (
                      <Pressable
                        key={uom}
                        onPress={() => setSelectedUOM(uom)}
                        className={`px-3 py-2 rounded-full ${
                          selectedUOM === uom ? "bg-blue-500" : "bg-white border border-gray-300"
                        }`}
                      >
                        <Text className={`text-sm ${
                          selectedUOM === uom ? "text-white font-medium" : "text-gray-700"
                        }`}>
                          {uom}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* Results Summary */}
        <View className="flex-row justify-between items-center">
          <Text className="text-lg font-semibold text-gray-900">
            Line Items ({filteredAndSortedItems.length} of {allItems.length})
          </Text>
          <View className="flex-row items-center space-x-2">
            <Pressable
              onPress={() => setViewMode("list")}
              className={`p-2 rounded ${viewMode === "list" ? "bg-blue-500" : "bg-gray-200"}`}
            >
              <Ionicons 
                name="list" 
                size={16} 
                color={viewMode === "list" ? "white" : "#6B7280"} 
              />
            </Pressable>
            <Pressable
              onPress={() => setViewMode("grid")}
              className={`p-2 rounded ${viewMode === "grid" ? "bg-blue-500" : "bg-gray-200"}`}
            >
              <Ionicons 
                name="grid" 
                size={16} 
                color={viewMode === "grid" ? "white" : "#6B7280"} 
              />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Line Items Section */}
      <View className="p-4">
        {filteredAndSortedItems.length !== allItems.length && (
          <View className="bg-blue-50 p-3 rounded-lg mb-3 border border-blue-200">
            <View className="flex-row items-center">
              <Ionicons name="funnel" size={16} color="#3B82F6" />
              <Text className="text-blue-800 ml-2 font-medium">
                Showing {filteredAndSortedItems.length} of {allItems.length} items
              </Text>
            </View>
             <Pressable
               onPress={() => {
                 setSelectedCategory("all");
                 setMinConfidence(0);
                 setSelectedUOM("all");
                 setSelectedLevel("all");
                 setSearchText("");
                 setSortBy("default");
               }}
               className="mt-2"
             >
               <Text className="text-blue-600 text-sm">Clear all filters</Text>
             </Pressable>

          </View>
        )}
        
        {/* Material Category Summary */}
        <View className="flex-row flex-wrap gap-2 mb-3">
          {(() => {
            const categories = new Map<string, number>();
            filteredAndSortedItems.forEach((item: TakeoffLineItem) => {
              const category = getCategoryFromScope(item.context.scope);
              categories.set(category.name, (categories.get(category.name) || 0) + 1);
            });
            
            return Array.from(categories.entries()).map(([categoryName, count]) => {
              const category = MATERIAL_CATEGORIES.find(c => c.name === categoryName) || MATERIAL_CATEGORIES[MATERIAL_CATEGORIES.length - 1];
              return (
                <View 
                  key={categoryName} 
                  className="px-2 py-1 rounded-full"
                  style={{ backgroundColor: `${category.color}20` }}
                >
                  <Text className="text-xs font-medium" style={{ color: category.color }}>
                    {categoryName}: {count}
                  </Text>
                </View>
              );
            });
          })()}
        </View>
      </View>
    </>
  );

  const EmptyComponent = (
    <View className="px-4">
      <View className="bg-white p-8 rounded-lg border border-gray-200 items-center">
        {allItems.length === 0 ? (
          <>
            <Ionicons name="calculator-outline" size={48} color="#9CA3AF" />
            <Text className="text-gray-600 font-medium mt-3 text-center">No Line Items</Text>
            <Text className="text-gray-500 text-center mt-1">
              Takeoff analysis did not generate any line items
            </Text>
            <View className="flex-row mt-4 space-x-2">
              <Pressable onPress={() => navigation.navigate("ProjectDetails", { projectId })} className="bg-gray-900 px-4 py-2 rounded-lg">
                <Text className="text-white font-medium">Reprocess now</Text>
              </Pressable>
              {project?.documents?.[0] && (
                <Pressable
                  onPress={async () => {
                    const doc = project.documents[0];
                    if (!(await Sharing.isAvailableAsync())) return;
                    await Sharing.shareAsync(doc.uri);
                  }}
                  className="bg-blue-500 px-4 py-2 rounded-lg"
                >
                  <Text className="text-white font-medium">Open source PDF</Text>
                </Pressable>
              )}
            </View>
          </>
        ) : (
          <>
            <Ionicons name="funnel-outline" size={48} color="#9CA3AF" />
            <Text className="text-gray-600 font-medium mt-3 text-center">No Matching Items</Text>
            <Text className="text-gray-500 text-center mt-1">
              Try adjusting your filters or search terms
            </Text>
            <Pressable
              onPress={() => {
                setSelectedCategory("all");
                setMinConfidence(0);
                setSelectedUOM("all");
                setSearchText("");
                setSortBy("default");
              }}
              className="bg-blue-500 px-4 py-2 rounded-lg mt-4"
            >
              <Text className="text-white font-medium">Clear Filters</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );

  const Footer = (
    <View className="p-4">
      <Pressable 
        onPress={() => setShowExportModal(true)}
        className="bg-green-500 p-4 rounded-lg flex-row items-center justify-center"
      >
        <Ionicons name="download-outline" size={20} color="white" />
        <Text className="text-white font-medium ml-2">Export Takeoff</Text>
      </Pressable>
      <View className="h-8" />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <FlatList
        data={filteredAndSortedItems}
        keyExtractor={(it, idx) => `${it.itemId}-${idx}`}
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        ListEmptyComponent={EmptyComponent}
        renderItem={({ item }) => (
          <View className="px-4 mb-3">
            <LineItemCard
              item={item}
              documentsById={Object.fromEntries((project?.documents || []).map(d => [d.id, d]))}
              onOpenEvidence={async (docId) => {
                const doc = project?.documents.find(d => d.id === docId);
                if (!doc) return;
                if (!(await Sharing.isAvailableAsync())) return;
                await Sharing.shareAsync(doc.uri);
              }}
              onAuditPress={handleAuditPress}
            />
          </View>
        )}
      />

      {/* Export Options Modal */}
      <Modal
        visible={showExportModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
            <Pressable onPress={() => setShowExportModal(false)}>
              <Text className="text-blue-500 text-lg">Cancel</Text>
            </Pressable>
            <Text className="text-lg font-semibold">Export Options</Text>
            <Pressable onPress={handleExport} disabled={isExporting}>
              <Text className="text-blue-500 text-lg font-medium">
                {isExporting ? "Exporting..." : "Export"}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 p-4">
            {/* Format Selection */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-900 mb-3">Export Format</Text>
              
              <Pressable
                onPress={() => setExportOptions(prev => ({ ...prev, format: "json" }))}
                className={`p-4 rounded-lg border mb-2 ${
                  exportOptions.format === "json" 
                    ? "border-blue-500 bg-blue-50" 
                    : "border-gray-200 bg-white"
                }`}
              >
                <View className="flex-row items-center">
                  <Ionicons 
                    name={exportOptions.format === "json" ? "radio-button-on" : "radio-button-off"} 
                    size={20} 
                    color={exportOptions.format === "json" ? "#3B82F6" : "#9CA3AF"} 
                  />
                  <View className="ml-3 flex-1">
                    <Text className="font-medium text-gray-900">JSON</Text>
                    <Text className="text-sm text-gray-500">
                      Complete data with all details and evidence
                    </Text>
                  </View>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setExportOptions(prev => ({ ...prev, format: "csv" }))}
                className={`p-4 rounded-lg border mb-2 ${
                  exportOptions.format === "csv" 
                    ? "border-blue-500 bg-blue-50" 
                    : "border-gray-200 bg-white"
                }`}
              >
                <View className="flex-row items-center">
                  <Ionicons 
                    name={exportOptions.format === "csv" ? "radio-button-on" : "radio-button-off"} 
                    size={20} 
                    color={exportOptions.format === "csv" ? "#3B82F6" : "#9CA3AF"} 
                  />
                  <View className="ml-3 flex-1">
                    <Text className="font-medium text-gray-900">CSV</Text>
                    <Text className="text-sm text-gray-500">
                      Spreadsheet format for further analysis
                    </Text>
                  </View>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setExportOptions(prev => ({ ...prev, format: "summary" }))}
                className={`p-4 rounded-lg border ${
                  exportOptions.format === "summary" 
                    ? "border-blue-500 bg-blue-50" 
                    : "border-gray-200 bg-white"
                }`}
              >
                <View className="flex-row items-center">
                  <Ionicons 
                    name={exportOptions.format === "summary" ? "radio-button-on" : "radio-button-off"} 
                    size={20} 
                    color={exportOptions.format === "summary" ? "#3B82F6" : "#9CA3AF"} 
                  />
                  <View className="ml-3 flex-1">
                    <Text className="font-medium text-gray-900">Summary Report</Text>
                    <Text className="text-sm text-gray-500">
                      Human-readable summary for review
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>

            {/* Include Options */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-900 mb-3">Include</Text>
              
              <View className="bg-white rounded-lg border border-gray-200">
                <View className="flex-row items-center justify-between p-4 border-b border-gray-100">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">Evidence References</Text>
                    <Text className="text-sm text-gray-500">
                      Source document references and page numbers
                    </Text>
                  </View>
                  <Switch
                    value={exportOptions.includeEvidence}
                    onValueChange={(value) => 
                      setExportOptions(prev => ({ ...prev, includeEvidence: value }))
                    }
                    trackColor={{ false: "#E5E7EB", true: "#3B82F6" }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View className="flex-row items-center justify-between p-4 border-b border-gray-100">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">Assumptions</Text>
                    <Text className="text-sm text-gray-500">
                      AI assumptions made during analysis
                    </Text>
                  </View>
                  <Switch
                    value={exportOptions.includeAssumptions}
                    onValueChange={(value) => 
                      setExportOptions(prev => ({ ...prev, includeAssumptions: value }))
                    }
                    trackColor={{ false: "#E5E7EB", true: "#3B82F6" }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View className="flex-row items-center justify-between p-4">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">Flags & Issues</Text>
                    <Text className="text-sm text-gray-500">
                      Warnings and missing information alerts
                    </Text>
                  </View>
                  <Switch
                    value={exportOptions.includeFlags}
                    onValueChange={(value) => 
                      setExportOptions(prev => ({ ...prev, includeFlags: value }))
                    }
                    trackColor={{ false: "#E5E7EB", true: "#3B82F6" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </View>

            {/* Export Info */}
            <View className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <View className="flex-row items-start">
                <Ionicons name="information-circle" size={20} color="#3B82F6" />
                <View className="flex-1 ml-2">
                  <Text className="text-blue-800 font-medium">Export Information</Text>
                  <Text className="text-blue-700 text-sm mt-1">
                    The exported file will include project details, takeoff data, and selected options. 
                    You can share it via email, save to files, or import into other estimating software.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Result Modal */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResultModal(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/40">
          <View className="bg-white mx-8 p-4 rounded-xl w-11/12">
            <Text className="text-lg font-semibold text-gray-900">{resultTitle}</Text>
            <Text className="text-gray-700 mt-2">{resultMessage}</Text>
            <View className="flex-row justify-end mt-4">
              <Pressable onPress={() => setShowResultModal(false)} className="px-4 py-2">
                <Text className="text-blue-600 font-medium">OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* REMOVED: Pricing modals - now handled in Project Details */}

       {/* Trace Modal */}
       <Modal visible={showTraceModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTraceModal(false)}>
         <SafeAreaView className="flex-1 bg-white">
           <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
             <Pressable onPress={() => setShowTraceModal(false)}>
               <Text className="text-blue-500 text-lg">Close</Text>
             </Pressable>
             <Text className="text-lg font-semibold">Processing Details</Text>
             <View style={{ width: 52 }} />
           </View>
            <ScrollView className="flex-1 p-4">
              {/* Flags & Issues moved here */}
              <View className="mb-4">
                <Text className="text-lg font-semibold text-gray-900 mb-3">Flags & Issues {flagsView.length > 0 ? `(${flagsView.length})` : ""}</Text>
                {flagsView.length === 0 ? (
                  <View className="bg-green-50 p-3 rounded-lg border border-green-200 items-center">
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text className="text-green-700 mt-2">No issues found for this run</Text>
                  </View>
                ) : (
                  flagsView.map((flag, index) => {
                    const sev = (flag.severity || "low") as any;
                    const colorMap: Record<string, string> = { critical: "#EF4444", high: "#F97316", medium: "#EAB308", low: "#3B82F6" };
                    const color = colorMap[sev] || "#3B82F6";
                    const bg = `${color}20`;
                    const icon = flag.type === "ASSUMPTION" ? "bulb-outline" : (sev === "critical" || sev === "high") ? "warning" : "information-circle";
                    return (
                      <View key={index} className="p-3 rounded-lg border mb-2" style={{ backgroundColor: bg, borderColor: color + "40" }}>
                        <View className="flex-row items-start">
                          <Ionicons name={icon as any} size={20} color={flag.type === "ASSUMPTION" ? "#10B981" : color} />
                          <View className="flex-1 ml-2">
                            <Text className="font-medium" style={{ color }}>{flag.type === "ASSUMPTION" ? "Intelligent Assumption" : String(flag.type).replace(/_/g, " ")}</Text>
                            <Text className="text-sm mt-1" style={{ color }}>{flag.message}</Text>
                            {Array.isArray((flag as any).sheets) && (flag as any).sheets.length > 0 ? (
                              <Text className="text-xs mt-1" style={{ color }}>{flag.type === "ASSUMPTION" ? "Applied to: " : "Sheets: "}{((flag as any).sheets || []).join(", ")}</Text>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
                {(flagsView.length > 0 || allItems.length === 0) && (
                  <Pressable
                    onPress={() => navigation.navigate("ProjectDetails", { projectId })}
                    className="mt-2 bg-gray-900 p-3 rounded-lg items-center"
                  >
                    <Text className="text-white font-medium">Reprocess now</Text>
                  </Pressable>
                )}
              </View>

              {/* Assumption Summary */}
              <View className="mb-4">
                <Text className="text-lg font-semibold text-gray-900 mb-2">Assumption Summary</Text>
                {allItems.filter(it => (it.assumptions || []).length > 0).length === 0 ? (
                  <Text className="text-sm text-gray-500">No assumed items</Text>
                ) : (
                  (() => {
                    const counts = new Map<string, number>();
                    allItems.forEach((it) => {
                      if ((it.assumptions || []).length > 0) {
                        const cat = getCategoryFromScope(it.context.scope).name;
                        counts.set(cat, (counts.get(cat) || 0) + 1);
                      }
                    });
                    return (
                      <View className="flex-row flex-wrap gap-2">
                        {Array.from(counts.entries()).map(([cat, n]) => (
                          <View key={cat} className="px-2 py-1 rounded-full bg-yellow-50 border border-yellow-200">
                            <Text className="text-xs text-yellow-700">{cat}: {n}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()
                )}
              </View>

              {/* Trace events */}
              <Text className="text-lg font-semibold text-gray-900 mb-2">Processing Trace</Text>
              {traceEvents.length === 0 ? (
                <View className="bg-gray-50 p-4 rounded-lg border border-gray-200 items-center">
                  <Ionicons name="information-circle-outline" size={32} color="#6B7280" />
                  <Text className="text-gray-600 mt-2">No details available</Text>
                </View>
              ) : (
                traceEvents.map((ev, idx) => (
                  <View key={`${ev.timestamp}-${idx}`} className="mb-2 p-3 rounded-lg border border-gray-200 bg-white">
                    <Text className="text-xs text-gray-500">{new Date(ev.timestamp).toLocaleString()}</Text>
                    <Text className="text-gray-900 font-medium mt-1">{ev.type.replace(/_/g, " ")}</Text>
                    {ev.stepId ? <Text className="text-gray-700">Step: {ev.stepId}</Text> : null}
                    {typeof ev.attempt === "number" ? <Text className="text-gray-700">Attempt: {ev.attempt}</Text> : null}
                    {typeof ev.latencyMs === "number" ? <Text className="text-gray-700">Latency: {ev.latencyMs} ms</Text> : null}
                    {ev.error ? <Text className="text-red-700 mt-1">{ev.error}</Text> : null}
                    {ev.message ? <Text className="text-gray-700 mt-1">{ev.message}</Text> : null}
                  </View>
                ))
              )}
            </ScrollView>
         </SafeAreaView>
       </Modal>

       {/* Decisions Modal */}
       <Modal visible={showDecisionsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDecisionsModal(false)}>
         <SafeAreaView className="flex-1 bg-white">
           <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
             <Pressable onPress={() => setShowDecisionsModal(false)}>
               <Text className="text-blue-500 text-lg">Close</Text>
             </Pressable>
             <Text className="text-lg font-semibold">AI Decisions ({decisions.length})</Text>
             <Pressable onPress={undoAllDecisions} disabled={decisions.length === 0}>
               <Text className="text-red-500 text-lg" style={{ opacity: decisions.length === 0 ? 0.4 : 1 }}>Undo all</Text>
             </Pressable>
           </View>
           <ScrollView className="flex-1 p-4">
             {decisions.length === 0 ? (
               <View className="bg-gray-50 p-4 rounded-lg border border-gray-200 items-center">
                 <Ionicons name="information-circle-outline" size={32} color="#6B7280" />
                 <Text className="text-gray-600 mt-2">No decisions to review</Text>
               </View>
             ) : (
               decisions.map((d) => (
                 <View key={d.id} className="mb-3 p-3 rounded-lg border border-gray-200 bg-white">
                   <Text className="text-gray-900 font-medium">{d.field}</Text>
                   <Text className="text-gray-700 mt-1">{String(d.itemId)}</Text>
                   <Text className="text-gray-700 mt-1">{`From: ${d.from ?? "unset"} → To: ${d.to}`}</Text>
                   <Text className="text-gray-500 text-xs mt-1">{`Confidence: ${Math.round((d.confidence || 0) * 100)}%`}</Text>
                   <Text className="text-gray-600 text-sm mt-1">{d.rationale}</Text>
                   {Array.isArray(d.sheets) && d.sheets.length > 0 ? (
                     <Text className="text-gray-500 text-xs mt-1">Sheets: {d.sheets.join(", ")}</Text>
                   ) : null}
                   <View className="flex-row justify-end mt-2">
                     <Pressable onPress={() => undoDecision(d.id)} className="px-3 py-2 rounded border border-red-300" style={{ backgroundColor: "#FEF2F2" }}>
                       <Text className="text-xs" style={{ color: "#DC2626" }}>Undo</Text>
                     </Pressable>
                   </View>
                 </View>
               ))
             )}
           </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Audit Drawer */}
        <AuditDrawer
          visible={showAuditDrawer}
          onClose={() => {
            setShowAuditDrawer(false);
            setSelectedAuditBundle(null);
          }}
          auditBundle={selectedAuditBundle}
        />

     </SafeAreaView>
   );
 }
