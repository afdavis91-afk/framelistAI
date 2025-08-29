import React, { useState, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TakeoffLineItem, ProjectDocument } from "../types/construction";
import { enableAuditTrail } from "../pipeline/featureFlags";
import { MaterialSpecNormalizer } from "../pricing/MaterialSpecNormalizer";

export default function LineItemCard({
  item,
  documentsById,
  onOpenEvidence,
  onAuditPress,
}: {
  item: TakeoffLineItem;
  documentsById: Record<string, ProjectDocument>;
  onOpenEvidence?: (docId: string, page?: number) => void;
  onAuditPress?: (item: TakeoffLineItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isSheathing = item.context.scope.toLowerCase().includes("sheathing") || /osb|plywood|sheathing/i.test(item.material.spec);

  // Normalize the material spec for pricing system compatibility
  const normalizedSpec = useMemo(() => {
    try {
      return MaterialSpecNormalizer.normalizeSpec(item.material.spec);
    } catch (error) {
      console.warn(`Failed to normalize material spec for ${item.itemId}:`, error);
      return null;
    }
  }, [item.material.spec]);

  // Determine if the spec needs normalization (shows warning if confidence is low)
  const needsNormalization = normalizedSpec && normalizedSpec.confidence < 0.6;
  const hasNormalization = normalizedSpec && normalizedSpec.confidence >= 0.6;
 
  const confidenceColor = item.confidence >= 0.8 ? "bg-green-500" : item.confidence >= 0.6 ? "bg-yellow-500" : "bg-red-500";
  const confidenceBadgeBg = item.confidence >= 0.8 ? "bg-green-100" : item.confidence >= 0.6 ? "bg-yellow-100" : "bg-red-100";
  const confidenceBadgeText = item.confidence >= 0.8 ? "text-green-700" : item.confidence >= 0.6 ? "text-yellow-700" : "text-red-700";

  return (
    <View className="bg-white p-4 rounded-lg border border-gray-200 mb-3">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
      >
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1 pr-2">
            <View className="flex-row items-center flex-wrap">
              <Text className="font-medium text-gray-900 mr-2">{item.itemId}</Text>
              {item.assumptions.length > 0 && (
                <View className="px-2 py-0.5 rounded-full border border-yellow-200" style={{ backgroundColor: "#FEF3C7" }}>
                  <Text className="text-xxs" style={{ color: "#92400E" }}>Assumed</Text>
                </View>
              )}
            </View>
          </View>
          <View className="flex-row items-center">
            <Text className="text-lg font-semibold text-gray-900">
              {item.qty}
            </Text>
            <Text className="text-sm text-gray-500 ml-1">
              {item.uom}
            </Text>
          </View>
        </View>

        <Text className="text-sm text-gray-600 mb-2">
          {item.material.spec} {item.material.grade}
          {!isSheathing && item.material.species && ` ${item.material.species}`}
          {item.material.treatment && ` (${item.material.treatment})`}
        </Text>

        {/* Normalized Material Spec for Pricing */}
        {hasNormalization && (
          <View className="mb-2 p-2 bg-green-50 border border-green-200 rounded">
            <View className="flex-row items-center mb-1">
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text className="text-xs font-medium text-green-700 ml-1">
                Pricing-Ready Spec
              </Text>
            </View>
            <Text className="text-sm text-green-800 font-medium">
              {normalizedSpec.normalizedSpec}
            </Text>
            <Text className="text-xs text-green-600 mt-1">
              Category: {normalizedSpec.category} • Confidence: {Math.round(normalizedSpec.confidence * 100)}%
            </Text>
          </View>
        )}

        {/* Normalization Warning */}
        {needsNormalization && (
          <View className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
            <View className="flex-row items-center mb-1">
              <Ionicons name="warning" size={16} color="#D97706" />
              <Text className="text-xs font-medium text-yellow-700 ml-1">
                Spec May Need Review
              </Text>
            </View>
            <Text className="text-sm text-yellow-800">
              {normalizedSpec.normalizedSpec}
            </Text>
            <Text className="text-xs text-yellow-600 mt-1">
              Low confidence ({Math.round(normalizedSpec.confidence * 100)}%) - pricing may fail
            </Text>
          </View>
        )}

        {/* Enhanced material details for structural members */}
        {(item.material.joistType || item.material.rafterType || item.material.beamType || item.material.hangerType) && (
          <View className="mb-2">
            {item.material.joistType && (
              <Text className="text-xs text-blue-600">
                {item.material.joistType} joist • {item.material.joistSpacing}" o.c. • {item.material.joistSpan}' span
              </Text>
            )}
            {item.material.rafterType && (
              <Text className="text-xs text-blue-600">
                {item.material.rafterType} rafter • {item.material.rafterSpacing}" o.c. • {item.material.pitch}/12 pitch
              </Text>
            )}
            {item.material.beamType && (
              <Text className="text-xs text-blue-600">
                {item.material.beamType} • {item.material.beamSpan}' span • {item.material.plyCount || 1} ply
              </Text>
            )}
            {item.material.hangerType && (
              <Text className="text-xs text-purple-600">
                {item.material.hangerType} • {item.material.hangerLoadRating}# rating
              </Text>
            )}
            {item.material.engineeredType && item.material.engineeredType !== "solid_sawn" && (
              <Text className="text-xs text-green-600">
                Engineered: {item.material.engineeredType}
              </Text>
            )}
          </View>
        )}

        <View className="flex-row items-center mb-2">
          <Text className="text-xs text-gray-500">
            {item.context.scope} • {item.context.level} • {item.context.sheetRef}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className={`w-2 h-2 rounded-full mr-2 ${confidenceColor}`} />
            <Text className="text-xs text-gray-500">
              {Math.round(item.confidence * 100)}% confidence
            </Text>
          </View>

          <View className="flex-row items-center">
            {item.assumptions.length > 0 && (
              <View className="flex-row items-center mr-3">
                <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
                <Text className="text-xs text-gray-500 ml-1">
                  {item.assumptions.length} assumptions
                </Text>
              </View>
            )}
            {item.enrichmentData && (
              <View className="flex-row items-center mr-3">
                <Ionicons name="sparkles" size={16} color="#10B981" />
                <Text className="text-xs text-green-600 ml-1">
                  Enhanced
                </Text>
              </View>
            )}
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#9CA3AF" />
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View>
          <View className="h-px bg-gray-200 my-3" />

          {/* Assumptions */}
          <Text className="text-sm font-semibold text-gray-900 mb-2">Assumptions</Text>
          {item.assumptions.length === 0 ? (
            <Text className="text-sm text-gray-500 mb-2">No assumptions recorded</Text>
          ) : (
            <View className="mb-2">
              {item.assumptions.map((a, i) => (
                <Text key={i} className="text-sm text-gray-700 mb-1">• {a}</Text>
              ))}
            </View>
          )}

          {/* Evidence */}
          <Text className="text-sm font-semibold text-gray-900 mb-2">Source & Evidence</Text>
          <View className="mb-2">
            <Text className="text-xs text-gray-500 mb-1">Context: {item.context.viewRef} • {item.context.sheetRef}</Text>
            {item.evidenceRefs && item.evidenceRefs.length > 0 ? (
              item.evidenceRefs.map((ref, idx) => {
                const doc = documentsById[ref.documentId];
                return (
                  <View key={idx} className="flex-row items-center justify-between py-2">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm text-gray-700">
                        {(doc && doc.name) || "Unknown document"}
                        {ref.pageNumber ? ` • Page ${ref.pageNumber}` : ""}
                      </Text>
                      {ref.description ? (
                        <Text className="text-xs text-gray-500 mt-0.5">{ref.description}</Text>
                      ) : null}
                    </View>
                    {onOpenEvidence && doc ? (
                      <Pressable
                        onPress={() => onOpenEvidence(ref.documentId, ref.pageNumber)}
                        className="px-3 py-1 rounded-full border border-gray-300"
                      >
                        <Text className="text-xs text-gray-700">Open</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text className="text-sm text-gray-500">No evidence references</Text>
                          )}
            </View>

            {/* Vision Analysis Evidence */}
            {item.evidenceRefs.filter(ref => ref.description.includes("Vision analysis")).map((ref, idx) => (
              <View key={`vision-${idx}`} className="mb-2 bg-blue-50 p-2 rounded">
                <Text className="text-xs font-medium text-blue-700 mb-1">Vision Analysis</Text>
                <Text className="text-xs text-blue-600">{ref.description}</Text>
                {onOpenEvidence && (
                  <Pressable
                    onPress={() => onOpenEvidence(ref.documentId, ref.pageNumber)}
                    className="mt-1 self-start"
                  >
                    <Text className="text-xs text-blue-600 underline">View Source</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {/* Material Spec Normalization Details */}
          {normalizedSpec && (
            <View className="mb-3">
              <Text className="text-sm font-semibold text-gray-900 mb-2">Material Spec Normalization</Text>
              
              <View className="mb-2">
                <Text className="text-xs font-medium text-gray-700 mb-1">Original Spec:</Text>
                <Text className="text-sm text-gray-600 font-mono">{item.material.spec}</Text>
              </View>

              <View className="mb-2">
                <Text className="text-xs font-medium text-gray-700 mb-1">Normalized Spec:</Text>
                <Text className="text-sm text-gray-800 font-medium">{normalizedSpec.normalizedSpec}</Text>
              </View>

              <View className="mb-2">
                <Text className="text-xs font-medium text-gray-700 mb-1">Category:</Text>
                <Text className="text-sm text-gray-600">{normalizedSpec.category}</Text>
              </View>

              {normalizedSpec.species && (
                <View className="mb-2">
                  <Text className="text-xs font-medium text-gray-700 mb-1">Species:</Text>
                  <Text className="text-sm text-gray-600">{normalizedSpec.species}</Text>
                </View>
              )}

              {normalizedSpec.grade && (
                <View className="mb-2">
                  <Text className="text-xs font-medium text-gray-700 mb-1">Grade:</Text>
                  <Text className="text-sm text-gray-600">{normalizedSpec.grade}</Text>
                </View>
              )}

              {normalizedSpec.treatment && (
                <View className="mb-2">
                  <Text className="text-xs font-medium text-gray-700 mb-1">Treatment:</Text>
                  <Text className="text-sm text-gray-600">{normalizedSpec.treatment}</Text>
                </View>
              )}

              {normalizedSpec.purpose && (
                <View className="mb-2">
                  <Text className="text-xs font-medium text-gray-700 mb-1">Purpose:</Text>
                  <Text className="text-sm text-gray-600">{normalizedSpec.purpose}</Text>
                </View>
              )}

              <View className="mb-2">
                <Text className="text-xs font-medium text-gray-700 mb-1">Dimensions:</Text>
                <Text className="text-sm text-gray-600">
                  {Object.entries(normalizedSpec.dimensions)
                    .filter(([_, value]) => value !== undefined)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ') || 'None detected'}
                </Text>
              </View>

              <View className="mb-2">
                <Text className="text-xs font-medium text-gray-700 mb-1">Confidence Score:</Text>
                <View className="flex-row items-center">
                  <View className={`w-3 h-3 rounded-full mr-2 ${
                    normalizedSpec.confidence >= 0.8 ? 'bg-green-500' : 
                    normalizedSpec.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <Text className={`text-sm font-medium ${
                    normalizedSpec.confidence >= 0.8 ? 'text-green-700' : 
                    normalizedSpec.confidence >= 0.6 ? 'text-yellow-700' : 'text-red-700'
                  }`}>
                    {Math.round(normalizedSpec.confidence * 100)}% - {
                      normalizedSpec.confidence >= 0.8 ? 'High' : 
                      normalizedSpec.confidence >= 0.6 ? 'Medium' : 'Low'
                    } Confidence
                  </Text>
                </View>
              </View>

              <View className="mb-2">
                <Text className="text-xs font-medium text-gray-700 mb-1">Pricing Impact:</Text>
                <Text className="text-sm text-gray-600">
                  {normalizedSpec.confidence >= 0.8 
                    ? '✅ This spec should generate accurate pricing'
                    : normalizedSpec.confidence >= 0.6 
                    ? '⚠️ This spec may have limited pricing options'
                    : '❌ This spec may cause pricing failures (NaN)'
                  }
                </Text>
              </View>
            </View>
          )}

          {/* Enrichment Results */}
          {item.enrichmentData && (
            <View className="mb-3">
              <Text className="text-sm font-semibold text-gray-900 mb-2">Enrichment Results</Text>
              
              {item.enrichmentData.specCandidates.length > 0 && (
                <View className="mb-2">
                  <Text className="text-xs font-medium text-green-700 mb-1">Specifications Found:</Text>
                  {item.enrichmentData.specCandidates.map((spec, idx) => (
                    <View key={idx} className="flex-row items-center justify-between py-1">
                      <Text className="text-xs text-gray-700 flex-1">{spec.specification}</Text>
                      <Text className="text-xs text-green-600 ml-2">{Math.round(spec.confidence * 100)}%</Text>
                    </View>
                  ))}
                </View>
              )}

              {item.enrichmentData.scheduleCandidates.length > 0 && (
                <View className="mb-2">
                  <Text className="text-xs font-medium text-blue-700 mb-1">Schedule Matches:</Text>
                  {item.enrichmentData.scheduleCandidates.map((schedule, idx) => (
                    <View key={idx} className="py-1">
                      <Text className="text-xs text-gray-700">{schedule.scheduleType}</Text>
                      <Text className="text-xs text-blue-600">{Math.round(schedule.confidence * 100)}% match</Text>
                    </View>
                  ))}
                </View>
              )}

              {item.enrichmentData.calloutResolutions.length > 0 && (
                <View className="mb-2">
                  <Text className="text-xs font-medium text-purple-700 mb-1">Callouts Resolved:</Text>
                  {item.enrichmentData.calloutResolutions.map((callout, idx) => (
                    <View key={idx} className="py-1">
                      <Text className="text-xs text-gray-700">{callout.callout} → {callout.resolvedTo}</Text>
                      <Text className="text-xs text-purple-600">{Math.round(callout.confidence * 100)}% confidence</Text>
                    </View>
                  ))}
                </View>
              )}

              {item.enrichmentData.confidenceBoost > 0 && (
                <View className="bg-green-50 px-2 py-1 rounded">
                  <Text className="text-xs text-green-700">
                    Confidence boosted by +{Math.round(item.enrichmentData.confidenceBoost * 100)}%
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Confidence note */}
          <View className="flex-row items-center justify-between">
            <View className={`px-2 py-1 rounded-full ${confidenceBadgeBg}`}>
              <Text className={`text-xs ${confidenceBadgeText}`}>
                Model confidence {Math.round(item.confidence * 100)}%
                {item.enrichmentData?.confidenceBoost ? " (enhanced)" : ""}
              </Text>
            </View>

            {/* Audit Button */}
            {enableAuditTrail() && item.auditRef && onAuditPress && (
              <Pressable
                onPress={() => onAuditPress(item)}
                className="flex-row items-center px-3 py-2 rounded-lg border border-blue-300 bg-blue-50"
              >
                <Ionicons name="analytics-outline" size={16} color="#3B82F6" />
                <Text className="text-xs text-blue-600 ml-1 font-medium">Audit</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
