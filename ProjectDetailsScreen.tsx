import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import { useNetInfo } from "@react-native-community/netinfo";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useConstructionStore } from "../state/constructionStore";
import { ProjectDocument, DocumentType, StepTraceEvent } from "../types/construction";
import { documentProcessingService } from "../services/documentProcessingService";
import { usePricingStore } from "../state/pricingStore";
import { usePricingRunner } from "../hooks/usePricingRunner";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ProjectDetailsRouteProp = RouteProp<RootStackParamList, "ProjectDetails">;

export default function ProjectDetailsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ProjectDetailsRouteProp>();
  const { projectId } = route.params;
  const netInfo = useNetInfo();
  
  const { 
    projects, 
    setCurrentProject, 
    addDocument, 
    isProcessingDocument,
    processingProgress,
    processingTraces,
  } = useConstructionStore();
  
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingTakeoff, setIsGeneratingTakeoff] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultTitle, setResultTitle] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [traceDocId, setTraceDocId] = useState<string | null>(null);
  
  const project = projects.find(p => p.id === projectId);
  
  // NEW: Pricing state - Backend-driven, no user options
  const { lastResultByProject } = usePricingStore();
  const { isRunning, status, error, runPricingForProject } = usePricingRunner(projectId);
  
  const pricingResult = lastResultByProject[projectId];
  const hasTakeoffs = (project?.takeoffs?.length || 0) > 0;
  
  React.useEffect(() => {
    if (project) {
      setCurrentProject(project);
    }
  }, [project, setCurrentProject]);

  const openResult = (title: string, message: string) => {
    setResultTitle(title);
    setResultMessage(message);
    setShowResultModal(true);
  };

  const handleAddDocument = async () => {
    try {
      setIsUploading(true);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Determine document type based on filename
        let docType: DocumentType = "architectural";
        const filename = asset.name.toLowerCase();
        if (filename.includes("s-") || filename.includes("struct")) {
          docType = "structural";
        } else if (filename.includes("spec") || filename.includes("div")) {
          docType = "specifications";
        } else if (filename.includes("addend") || filename.includes("bulletin")) {
          docType = "addenda";
        }

        const newDocument: Omit<ProjectDocument, "id"> = {
          name: asset.name,
          type: docType,
          uri: asset.uri,
          size: asset.size || 0,
          uploadedAt: new Date(),
          processed: false,
          processingStatus: "pending",
        };

        addDocument(projectId, newDocument);
        openResult("Document Added", `${asset.name} has been added. You can now process it for takeoff analysis.`);
      }
    } catch (error) {
      openResult("Error", "Failed to add document. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcessDocument = async (documentId: string) => {
    if (!netInfo.isConnected) {
      openResult("Offline", "You appear to be offline. Reconnect and try again.");
      return;
    }
    try {
      await documentProcessingService.processDocument(
        projectId,
        documentId
      );
      openResult("Processing Complete", "Document has been analyzed and is ready for takeoff generation.");
    } catch (error) {
      openResult("Processing Failed", "Failed to process document. Please view details and try again.");
    }
  };

  const handleGenerateTakeoff = async () => {
    const processedDocs = project?.documents.filter(d => d.processed) || [];
    
    if (processedDocs.length === 0) {
      openResult("No Processed Documents", "Please process at least one document before generating a takeoff.");
      return;
    }

    if (!netInfo.isConnected) {
      openResult("Offline", "You appear to be offline. Reconnect and try again.");
      return;
    }

    try {
      setIsGeneratingTakeoff(true);
      
      const processedIds = processedDocs.map(d => d.id);
      const takeoffIds = await documentProcessingService.processMultipleDocuments(
        projectId,
        processedIds
      );
      const takeoffId = takeoffIds[takeoffIds.length - 1];
      openResult("Takeoff Generated", "A new takeoff has been created from your processed documents.");
      // Offer navigation
      setTimeout(() => {
        navigation.navigate("TakeoffResults", { 
          takeoffId, 
          projectId 
        });
      }, 300);
    } catch (error) {
      openResult("Error", "Failed to generate takeoff. Please try again.");
    } finally {
      setIsGeneratingTakeoff(false);
    }
  };
  
  // NEW: Pricing handlers - Pure backend, no user options needed
  const handleRunPricing = async () => {
    if (!hasTakeoffs || isRunning) return;
    
    try {
      // Get line items from latest takeoff
      const latestTakeoff = project?.takeoffs?.[0];
      if (!latestTakeoff?.lineItems) return;
      
      // Run pricing with backend defaults - no user configuration needed
      await runPricingForProject(latestTakeoff.lineItems);
      
      // Navigate directly to pricing results
      navigation.navigate("ProjectPricing", { projectId });
    } catch (error) {
      openResult("Pricing Failed", "Failed to run pricing analysis. Please try again.");
      console.error("Pricing failed:", error);
    }
  };
  
  const handleViewLastResults = () => {
    if (pricingResult) {
      navigation.navigate("ProjectPricing", { projectId });
    }
  };
  
  const handleAudit = () => {
    // TODO: Navigate to PricingAuditScreen focused on this project
    console.log("Navigate to audit");
  };

  const getDocumentTypeIcon = (type: DocumentType) => {
    switch (type) {
      case "architectural":
        return "home-outline";
      case "structural":
        return "construct-outline";
      case "specifications":
        return "list-outline";
      case "addenda":
        return "document-text-outline";
      default:
        return "document-outline";
    }
  };

  const getDocumentTypeColor = (type: DocumentType) => {
    switch (type) {
      case "architectural":
        return "#3B82F6";
      case "structural":
        return "#EF4444";
      case "specifications":
        return "#10B981";
      case "addenda":
        return "#F59E0B";
      default:
        return "#6B7280";
    }
  };

  const renderDocument = (doc: ProjectDocument) => (
    <Pressable
      key={doc.id}
      className="bg-white p-4 rounded-lg border border-gray-200 mb-3"
      onPress={() => navigation.navigate("DocumentViewer", { 
        documentId: doc.id, 
        projectId: projectId 
      })}
    >
      <View className="flex-row items-center">
        <View 
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: `${getDocumentTypeColor(doc.type)}20` }}
        >
          <Ionicons 
            name={getDocumentTypeIcon(doc.type) as keyof typeof Ionicons.glyphMap} 
            size={20} 
            color={getDocumentTypeColor(doc.type)} 
          />
        </View>
        
        <View className="flex-1">
          <Text className="font-medium text-gray-900 mb-1">{doc.name}</Text>
          <View className="flex-row items-center">
            <Text className="text-sm text-gray-500 capitalize">{doc.type}</Text>
            <Text className="text-sm text-gray-400 mx-2">•</Text>
            <Text className="text-sm text-gray-500">
              {(doc.size / 1024 / 1024).toFixed(1)} MB
            </Text>
          </View>
          
          {doc.processingStatus !== "pending" && (
            <View className="flex-row items-center mt-1">
              <View 
                className={`w-2 h-2 rounded-full mr-2 ${
                  doc.processingStatus === "completed" 
                    ? "bg-green-500" 
                    : doc.processingStatus === "processing"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
              />
              <Text className={`text-xs ${
                doc.processingStatus === "completed" 
                  ? "text-green-600" 
                  : doc.processingStatus === "processing"
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}>
                {doc.processingStatus === "completed" 
                  ? "Processed" 
                  : doc.processingStatus === "processing"
                  ? "Processing..."
                  : "Failed"
                }
              </Text>
            </View>
          )}
        </View>
        
        <View className="flex-row items-center">
          {!doc.processed && doc.processingStatus === "pending" && (
            <Pressable
              onPress={() => handleProcessDocument(doc.id)}
              className="bg-blue-500 px-3 py-1 rounded mr-2"
              disabled={!netInfo.isConnected}
            >
              <Text className="text-white text-xs font-medium">Process</Text>
            </Pressable>
          )}
          {doc.processingStatus === "failed" && (
            <Pressable
              onPress={() => handleProcessDocument(doc.id)}
              className="bg-red-500 px-3 py-1 rounded mr-2"
              disabled={!netInfo.isConnected}
            >
              <Text className="text-white text-xs font-medium">Retry</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setTraceDocId(doc.id)} className="px-2 py-1 rounded border border-gray-300">
            <Text className="text-xs text-gray-700">View details</Text>
          </Pressable>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );

  if (!project) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        <Text className="text-gray-500">Project not found</Text>
      </SafeAreaView>
    );
  }

  const traceEvents: StepTraceEvent[] = traceDocId ? (processingTraces[traceDocId] || []) : [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Offline Banner */}
        {!netInfo.isConnected && (
          <View className="bg-yellow-50 p-3 mx-4 mt-4 rounded-lg border border-yellow-200">
            <View className="flex-row items-center">
              <Ionicons name="cloud-offline" size={18} color="#EAB308" />
              <Text className="text-yellow-800 font-medium ml-2">Offline</Text>
            </View>
            <Text className="text-yellow-700 text-sm mt-1">Reconnect to process documents and generate takeoffs.</Text>
          </View>
        )}

        {/* Project Header */}
        <View className="bg-white p-4 border-b border-gray-200">
          <Text className="text-2xl font-bold text-gray-900 mb-2">
            {project.name}
          </Text>
          {project.address ? (
            <Text className="text-gray-600 mb-3">{project.address}</Text>
          ) : null}
          
          <View className="flex-row">
            <View className="flex-row items-center mr-6">
              <Ionicons name="document-outline" size={16} color="#6B7280" />
              <Text className="text-sm text-gray-600 ml-1">
                {project.documents.length} documents
              </Text>
            </View>
            <View className="flex-row items-center">
              <Ionicons name="calculator-outline" size={16} color="#6B7280" />
              <Text className="text-sm text-gray-600 ml-1">
                {project.takeoffs.length} takeoffs
              </Text>
            </View>
          </View>
        </View>

        {/* Processing Status */}
        {isProcessingDocument && (
          <View className="bg-blue-50 p-4 mx-4 mt-4 rounded-lg border border-blue-200">
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text className="text-blue-800 font-medium ml-2">
                Processing Document...
              </Text>
            </View>
            <View className="bg-blue-200 h-2 rounded-full mt-2">
              <View 
                className="bg-blue-500 h-2 rounded-full"
                style={{ width: `${processingProgress}%` }}
              />
            </View>
            <Text className="text-blue-600 text-sm mt-1">
              {Math.round(processingProgress)}% complete
            </Text>
          </View>
        )}

        {/* Documents Section */}
        <View className="p-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-semibold text-gray-900">Documents</Text>
            <Pressable
              onPress={handleAddDocument}
              disabled={isUploading}
              className="bg-blue-500 px-4 py-2 rounded-lg flex-row items-center"
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="add" size={20} color="white" />
              )}
              <Text className="text-white font-medium ml-1">
                {isUploading ? "Adding..." : "Add PDF"}
              </Text>
            </Pressable>
          </View>

          {project.documents.length === 0 ? (
            <View className="bg-white p-8 rounded-lg border border-gray-200 items-center">
              <Ionicons name="document-outline" size={48} color="#9CA3AF" />
              <Text className="text-gray-600 font-medium mt-3 text-center">
                No Documents Added
              </Text>
              <Text className="text-gray-500 text-center mt-1">
                Add architectural and structural PDFs to begin analysis
              </Text>
            </View>
          ) : (
            <>
              {project.documents.map(renderDocument)}
              {project.documents.some(d => d.processingStatus === "pending") && (
                <Pressable
                  onPress={async () => {
                    if (!netInfo.isConnected) {
                      openResult("Offline", "You appear to be offline. Reconnect and try again.");
                      return;
                    }
                    try {
                      setIsGeneratingTakeoff(true);
                      const ids = project.documents.map(d => d.id);
                      await documentProcessingService.processMultipleDocuments(projectId, ids);
                      openResult("Analysis Complete", "All documents have been analyzed.");
                    } catch (e) {
                      openResult("Error", "Failed to analyze all PDFs. Please try individually.");
                    } finally {
                      setIsGeneratingTakeoff(false);
                    }
                  }}
                  className="bg-gray-800 px-4 py-2 rounded-lg mt-2 self-start"
                >
                  <Text className="text-white font-medium">Analyze All PDFs</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* Takeoffs Section */}
        <View className="p-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-semibold text-gray-900">Takeoffs</Text>
          <Pressable
            onPress={handleGenerateTakeoff}
            className="bg-green-500 px-4 py-2 rounded-lg flex-row items-center"
            disabled={project.documents.filter(d => d.processed).length === 0 || isGeneratingTakeoff}
          >
            {isGeneratingTakeoff ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="calculator" size={20} color="white" />
            )}
            <Text className="text-white font-medium ml-1">
              {isGeneratingTakeoff ? "Generating..." : "Generate Takeoff"}
            </Text>
          </Pressable>
          </View>

          {project.takeoffs.length === 0 ? (
            <View className="bg-white p-8 rounded-lg border border-gray-200 items-center">
              <Ionicons name="calculator-outline" size={48} color="#9CA3AF" />
              <Text className="text-gray-600 font-medium mt-3 text-center">
                No Takeoffs Generated
              </Text>
              <Text className="text-gray-500 text-center mt-1">
                Process documents first, then generate takeoffs
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {([...project.takeoffs]
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
                .map((t, idx, arr) => (
                  <Pressable
                    key={t.id}
                    onPress={() => navigation.navigate("TakeoffResults", { takeoffId: t.id, projectId })}
                    className={`px-4 py-3 ${idx < arr.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 pr-3">
                        <Text className="font-medium text-gray-900">
                          {`Takeoff ${arr.length - idx}`}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-1">
                          {(t.updatedAt ? new Date(t.updatedAt) : new Date()).toLocaleString()} • {(Array.isArray((t as any).lineItems) ? (t as any).lineItems.length : Array.isArray((t as any).takeoff) ? (t as any).takeoff.length : 0)} items • {(Array.isArray((t as any).flags) ? (t as any).flags.length : 0)} flags
                        </Text>
                      </View>
                      <View className="flex-row items-center">
                        <View className={`px-2 py-1 rounded-full ${
                          t.confidence >= 0.8 ? "bg-green-100" : t.confidence >= 0.6 ? "bg-yellow-100" : "bg-red-100"
                        }`}>
                          <Text className={`text-xs ${
                            t.confidence >= 0.8 ? "text-green-700" : t.confidence >= 0.6 ? "text-yellow-700" : "text-red-700"
                          }`}>
                            {Math.round(t.confidence * 100)}%
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" className="ml-2" />
                      </View>
                    </View>
                  </Pressable>
                ))}
            </View>
          )}
        </View>

        {/* NEW: Pricing Section */}
        <View className="p-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-semibold text-gray-900">Pricing Analysis</Text>
          </View>
          
          {!hasTakeoffs ? (
            <View className="bg-white p-8 rounded-lg border border-gray-200 items-center">
              <Ionicons name="pricetag-outline" size={48} color="#9CA3AF" />
              <Text className="text-gray-600 font-medium mt-3 text-center">
                No Takeoffs Available
              </Text>
              <Text className="text-gray-500 text-center mt-1">
                Generate a takeoff first to run pricing analysis
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Primary CTA: Run Pricing */}
              <Pressable
                onPress={handleRunPricing}
                disabled={isRunning}
                className="p-4 border-b border-gray-100"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Ionicons name="calculator" size={24} color="#3B82F6" />
                    <View className="ml-3">
                      <Text className="font-medium text-gray-900">Run Pricing Analysis</Text>
                      <Text className="text-sm text-gray-500">
                        {isRunning ? "Analyzing costs..." : "AI-powered cost analysis with live pricing"}
                      </Text>
                    </View>
                  </View>
                  {isRunning ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  )}
                </View>
              </Pressable>
              
              {/* Secondary: View Last Results */}
              {pricingResult && (
                <Pressable
                  onPress={handleViewLastResults}
                  className="p-4 border-b border-gray-100"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <Ionicons name="eye-outline" size={24} color="#10B981" />
                      <View className="ml-3">
                        <Text className="font-medium text-gray-900">View Last Results</Text>
                        <Text className="text-sm text-gray-500">
                          Generated {new Date(pricingResult.asOfISO).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </View>
                </Pressable>
              )}
              
              {/* Tertiary: Audit */}
              <Pressable
                onPress={handleAudit}
                className="p-4"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Ionicons name="document-text-outline" size={24} color="#F59E0B" />
                    <View className="ml-3">
                      <Text className="font-medium text-gray-900">Audit</Text>
                      <Text className="text-sm text-gray-500">
                        Review pricing decisions and assumptions
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

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

      {/* Trace Details Modal */}
      <Modal
        visible={traceDocId !== null}
        animationType="slide"
        onRequestClose={() => setTraceDocId(null)}
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
            <Pressable onPress={() => setTraceDocId(null)}>
              <Text className="text-blue-500 text-lg">Close</Text>
            </Pressable>
            <Text className="text-lg font-semibold">Processing Details</Text>
            <View style={{ width: 52 }} />
          </View>
          <ScrollView className="flex-1 p-4">
            {traceEvents.length === 0 ? (
              <View className="bg-gray-50 p-4 rounded-lg border border-gray-200 items-center">
                <Ionicons name="information-circle-outline" size={32} color="#6B7280" />
                <Text className="text-gray-600 mt-2">No details available yet</Text>
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
    </SafeAreaView>
  );
}