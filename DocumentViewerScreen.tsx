import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Pressable, ActivityIndicator, Dimensions, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "expo-image";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useConstructionStore } from "../state/constructionStore";
import { documentProcessingService } from "../services/documentProcessingService";
import { PDFImageService } from "../services/pdfImageService";
import { PDFImageManifest, DocumentViewerBBox, DocumentViewerState, PDFPageInfo } from "../types/construction";
import DocumentPageViewer from "../components/DocumentPageViewer";
import PDFRendererWebView from "../components/PDFRendererWebView";

type DocumentViewerRouteProp = RouteProp<RootStackParamList, "DocumentViewer">;

export default function DocumentViewerScreen() {
  const route = useRoute<DocumentViewerRouteProp>();
  const { documentId, projectId } = route.params;
  
  const { projects, updateDocument } = useConstructionStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [imageManifest, setImageManifest] = useState<PDFImageManifest | null>(null);
  const [viewerState, setViewerState] = useState<DocumentViewerState>({ currentPage: 1, zoomLevel: 1, panOffset: { x: 0, y: 0 }, highlights: [] });
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [jumpToPage, setJumpToPage] = useState("");

  // Conversion (WebView) state
  const [converting, setConverting] = useState(false);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [readAccessDir, setReadAccessDir] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [convertError, setConvertError] = useState<string | null>(null);
  const pagesBuffer = useRef<PDFPageInfo[]>([]);
  const cacheDirRef = useRef<string>("");

  const project = projects.find(p => p.id === projectId);
  const document = project?.documents.find(d => d.id === documentId);
  const screenDimensions = Dimensions.get("window");

  // Load image manifest on component mount
  useEffect(() => {
    loadImageManifest();
  }, [documentId]);

  // Parse deep link parameters and route.params directly
  useFocusEffect(
    useCallback(() => {
      const p: any = route.params || {};
      const pageParam = p.page;
      const bboxParam = p.bbox;
      if (pageParam && imageManifest?.totalPages) {
        const pageNum = parseInt(String(pageParam), 10);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= imageManifest.totalPages) {
          setViewerState(prev => ({ ...prev, currentPage: pageNum }));
        }
      }
      if (typeof bboxParam === "string") {
        try {
          const [x, y, w, h] = bboxParam.split(",").map(Number);
          if ([x, y, w, h].every(n => !isNaN(n))) {
            const highlight: DocumentViewerBBox = { x, y, width: w, height: h, color: "rgba(255, 255, 0, 0.3)", label: "Deep Link Highlight" };
            setViewerState(prev => ({ ...prev, highlights: [highlight] }));
          }
        } catch {}
      }
    }, [route.params, imageManifest])
  );

  const loadImageManifest = async () => {
    if (!document) return;
    try {
      setIsLoadingImages(true);
      setConvertError(null);
      const isCached = await PDFImageService.isCached(document.id);
      if (isCached) {
        const manifest = await PDFImageService.loadManifest(document.id);
        setImageManifest(manifest);
      } else if (document.processed) {
        // Prepare conversion via WebView + PDF.js
        pagesBuffer.current = [];
        setProgress({ current: 0, total: 0 });
        const cacheDir = await PDFImageService.ensureCacheDirectories(document.id);
        cacheDirRef.current = cacheDir;
        // Copy source PDF into cache dir to ensure read access
        const sourcePath = `${cacheDir}/source.pdf`;
        try {
          // If already exists, skip copy
          const info = await FileSystem.getInfoAsync(sourcePath);
          if (!info.exists) {
            await FileSystem.copyAsync({ from: document.uri, to: sourcePath });
          }
        } catch {
          // Fallback: try write/read base64 if copy fails (rare)
          const base64Data = await FileSystem.readAsStringAsync(document.uri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(sourcePath, base64Data, { encoding: FileSystem.EncodingType.Base64 });
        }
        setPdfPath(sourcePath);
        setReadAccessDir(cacheDir);
        setConverting(true);
      }
    } catch (error) {
      setConvertError("Failed to prepare document");
    } finally {
      setIsLoadingImages(false);
    }
  };

  const handleProcessDocument = async () => {
    if (!document) return;
    try {
      setIsProcessing(true);
      await documentProcessingService.processDocument(projectId, documentId);
      await loadImageManifest();
    } catch (error) {
      // inline error state
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePageChange = (pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= (imageManifest?.totalPages || 0)) {
      setViewerState(prev => ({ ...prev, currentPage: pageNumber }));
    }
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage, 10);
    if (pageNum > 0 && pageNum <= (imageManifest?.totalPages || 0)) {
      handlePageChange(pageNum);
      setJumpToPage("");
    }
  };

  // WebView conversion callbacks
  const onMeta = async ({ totalPages }: { totalPages: number }) => {
    setProgress({ current: 0, total: totalPages });
  };

  const onPage = async ({ pageNumber, width, height, base64 }: { pageNumber: number; width: number; height: number; base64: string }) => {
    try {
      const cacheDir = cacheDirRef.current;
      const fullImagePath = `${cacheDir}/pages/page_${pageNumber}.jpeg`;
      const thumbPath = `${cacheDir}/thumbnails/page_${pageNumber}.jpeg`;
      await FileSystem.writeAsStringAsync(fullImagePath, base64, { encoding: FileSystem.EncodingType.Base64 });
      const thumb = await ImageManipulator.manipulateAsync(fullImagePath, [{ resize: { width: 200 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
      await FileSystem.moveAsync({ from: thumb.uri, to: thumbPath });
      const infoRes = await FileSystem.getInfoAsync(fullImagePath) as any;
      const fileSize = (infoRes?.exists && !infoRes?.isDirectory) ? (infoRes.size || 0) : 0;
      pagesBuffer.current.push({ pageNumber, width, height, thumbnailPath: thumbPath, fullImagePath, aspectRatio: width / height, fileSize });
      setProgress(prev => ({ current: pageNumber, total: prev.total }));
    } catch {}
  };

  const onDone = async () => {
    try {
      const pages = pagesBuffer.current.sort((a, b) => a.pageNumber - b.pageNumber);
      const manifest: PDFImageManifest = {
        documentId,
        totalPages: pages.length,
        createdAt: new Date(),
        pdfSize: document?.size || 0,
        pages,
        cacheDirectory: cacheDirRef.current,
        version: "1.0",
      };
      await PDFImageService.writeManifest(manifest);
      setImageManifest(manifest);
      updateDocument(documentId, { imageManifest: manifest });
      setConverting(false);
      setPdfPath(null);
      PDFImageService.manageCacheSize().catch(() => {});
    } catch (e) {
      setConverting(false);
      setConvertError("Failed to finalize conversion");
    }
  };

  const onError = (message: string) => {
    setConvertError(message || "Render error");
    setConverting(false);
  };

  if (!document) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        <Text className="text-gray-500">Document not found</Text>
      </SafeAreaView>
    );
  }

  // Show conversion state
  if (converting) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        {pdfPath ? (
          <PDFRendererWebView
            pdfFilePath={pdfPath}
            readAccessPath={readAccessDir}
            fullWidth={800}
            quality={0.8}
            maxPages={50}
            onMeta={onMeta}
            onPage={onPage}
            onDone={onDone}
            onError={onError}
          />
        ) : null}
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-gray-600 mt-4">Rendering page {progress.current} of {progress.total}...</Text>
        {convertError ? (
          <Text className="text-red-600 mt-2">{convertError}</Text>
        ) : null}
      </SafeAreaView>
    );
  }

  // Show image viewer if manifest is loaded
  if (imageManifest && !isLoadingImages) {
    const currentPageInfo = imageManifest.pages[viewerState.currentPage - 1];
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="bg-white p-4 border-b border-gray-200">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-gray-900" numberOfLines={1}>{document.name}</Text>
              <Text className="text-sm text-gray-500">Page {viewerState.currentPage} of {imageManifest.totalPages}</Text>
            </View>
            <View className="flex-row items-center space-x-2">
              <Pressable onPress={() => setShowThumbnails(!showThumbnails)} className="p-2 rounded-lg bg-gray-100">
                <Ionicons name="grid-outline" size={20} color="#374151" />
              </Pressable>
              <Pressable onPress={async () => { try { if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(document.uri); } } catch {} }} className="p-2 rounded-lg bg-gray-100">
                <Ionicons name="share-outline" size={20} color="#374151" />
              </Pressable>
            </View>
          </View>
        </View>

        <View className="flex-1">
          <DocumentPageViewer
            page={currentPageInfo}
            containerWidth={screenDimensions.width}
            containerHeight={screenDimensions.height - 200}
            highlights={viewerState.highlights}
            onZoomChange={(zoom) => setViewerState(prev => ({ ...prev, zoomLevel: zoom }))}
            onPanChange={(pan) => setViewerState(prev => ({ ...prev, panOffset: pan }))}
          />
        </View>

        <View className="bg-white p-4 border-t border-gray-200">
          <View className="flex-row items-center justify-between">
            <Pressable onPress={() => handlePageChange(viewerState.currentPage - 1)} disabled={viewerState.currentPage <= 1} className={`p-3 rounded-lg ${viewerState.currentPage <= 1 ? "bg-gray-100" : "bg-blue-500"}`}>
              <Ionicons name="chevron-back" size={20} color={viewerState.currentPage <= 1 ? "#9CA3AF" : "white"} />
            </Pressable>
            <View className="flex-row items-center space-x-2">
              <TextInput value={jumpToPage} onChangeText={setJumpToPage} onSubmitEditing={handleJumpToPage} placeholder={`${viewerState.currentPage}`} className="border border-gray-300 rounded-lg px-3 py-2 text-center w-16" keyboardType="numeric" returnKeyType="go" />
              <Text className="text-gray-500">of {imageManifest.totalPages}</Text>
            </View>
            <Pressable onPress={() => handlePageChange(viewerState.currentPage + 1)} disabled={viewerState.currentPage >= imageManifest.totalPages} className={`p-3 rounded-lg ${viewerState.currentPage >= imageManifest.totalPages ? "bg-gray-100" : "bg-blue-500"}`}>
              <Ionicons name="chevron-forward" size={20} color={viewerState.currentPage >= imageManifest.totalPages ? "#9CA3AF" : "white"} />
            </Pressable>
          </View>
        </View>

        {showThumbnails && (
          <View className="bg-white border-t border-gray-200" style={{ height: 120 }}>
            <FlashList
              data={imageManifest.pages}
              horizontal
              showsHorizontalScrollIndicator={false}
              estimatedItemSize={80}
              renderItem={({ item, index }) => (
                <Pressable onPress={() => handlePageChange(index + 1)} className={`m-2 rounded-lg overflow-hidden ${index + 1 === viewerState.currentPage ? "border-2 border-blue-500" : "border border-gray-300"}`}>
                  <Image source={{ uri: item.thumbnailPath }} style={{ width: 64, height: 80 }} contentFit="cover" />
                </Pressable>
              )}
            />
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Show loading state for images
  if (isLoadingImages) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-gray-600 mt-4">Checking image cache...</Text>
      </SafeAreaView>
    );
  }

  // Unprocessed document actions
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white p-4 border-b border-gray-200">
        <Text className="text-lg font-semibold text-gray-900 mb-2">{document.name}</Text>
        <View className="flex-row items-center">
          <Text className="text-sm text-gray-500 capitalize">{document.type}</Text>
          <Text className="text-sm text-gray-400 mx-2">•</Text>
          <Text className="text-sm text-gray-500">{(document.size / 1024 / 1024).toFixed(1)} MB</Text>
        </View>
      </View>

      <View className="flex-1 items-center justify-center p-8">
        <Ionicons name="document-text-outline" size={64} color="#9CA3AF" />
        <Text className="text-gray-600 mt-3 text-center">Process this document to view it as images with zoom and navigation features.</Text>
        <Pressable onPress={async () => { try { if (!(await Sharing.isAvailableAsync())) return; await Sharing.shareAsync(document.uri); } catch {} }} className="bg-gray-800 px-5 py-3 rounded-lg mt-4">
          <Text className="text-white font-medium">Open PDF</Text>
        </Pressable>
      </View>

      <View className="bg-white p-4 border-t border-gray-200">
        {!document.processed && document.processingStatus === "pending" && (
          <Pressable onPress={handleProcessDocument} disabled={isProcessing} className="bg-blue-500 px-6 py-3 rounded-lg flex-row items-center justify-center">
            {isProcessing ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="analytics-outline" size={20} color="white" />}
            <Text className="text-white font-medium ml-2">{isProcessing ? "Processing..." : "Process Document"}</Text>
          </Pressable>
        )}
        {document.processed && (
          <View className="items-center">
            <View className="flex-row items-center mb-2">
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              <Text className="text-green-600 font-medium ml-2">Document Processed</Text>
            </View>
            <Text className="text-gray-500 text-center text-sm">This document is ready for takeoff generation and image viewing</Text>
          </View>
        )}
        {document.processingStatus === "processing" && (
          <View className="items-center">
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text className="text-blue-600 font-medium mt-2">Processing Document...</Text>
          </View>
        )}
        {document.processingStatus === "failed" && (
          <View className="items-center">
            <View className="flex-row items-center mb-2">
              <Ionicons name="alert-circle" size={24} color="#EF4444" />
              <Text className="text-red-600 font-medium ml-2">Processing Failed</Text>
            </View>
            <Pressable onPress={handleProcessDocument} disabled={isProcessing} className="bg-blue-500 px-4 py-2 rounded-lg">
              <Text className="text-white font-medium">Retry Processing</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
