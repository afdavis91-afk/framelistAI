import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialSpecNormalizer } from '../../pricing/MaterialSpecNormalizer';

interface NormalizationResult {
  original: string;
  normalized: string;
  category: string;
  species: string;
  grade: string;
  treatment: string;
  purpose: string;
  dimensions: any;
  confidence: number;
}

export default function MaterialSpecNormalizerTest() {
  const [testSpec, setTestSpec] = useState('');
  const [results, setResults] = useState<NormalizationResult[]>([]);

  // Pre-populate with your actual material specs
  const sampleSpecs = [
    'STUDS_2X4_16OC',
    'PLATES_BOTTOM_PT', 
    'PLATES_TOP_DOUBLE',
    'FLOOR_JOISTS_2X12',
    'SHEATHING_WALL_OSB_716_EXTERIORINTERIOR',
    'ANCHOR_BOLT_ASSUMED_1756414195838',
    'HANGER_FOR_FLOOR_JOISTS_2X12'
  ];

  const testNormalization = (spec: string) => {
    try {
      const normalized = MaterialSpecNormalizer.normalizeSpec(spec);
      
      const result: NormalizationResult = {
        original: spec,
        normalized: normalized.normalizedSpec,
        category: normalized.category,
        species: normalized.species || 'N/A',
        grade: normalized.grade || 'N/A',
        treatment: normalized.treatment || 'N/A',
        purpose: normalized.purpose || 'N/A',
        dimensions: normalized.dimensions,
        confidence: normalized.confidence
      };

      setResults(prev => [result, ...prev]);
    } catch (error) {
      console.error('Normalization failed:', error);
    }
  };

  const testAllSamples = () => {
    const allResults = sampleSpecs.map(spec => {
      const normalized = MaterialSpecNormalizer.normalizeSpec(spec);
      return {
        original: spec,
        normalized: normalized.normalizedSpec,
        category: normalized.category,
        species: normalized.species || 'N/A',
        grade: normalized.grade || 'N/A',
        treatment: normalized.treatment || 'N/A',
        purpose: normalized.purpose || 'N/A',
        dimensions: normalized.dimensions,
        confidence: normalized.confidence
      };
    });
    setResults(allResults);
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Material Spec Normalizer Test</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Test Individual Spec</Text>
        <TextInput
          style={styles.input}
          value={testSpec}
          onChangeText={setTestSpec}
          placeholder="Enter material spec (e.g., STUDS_2X4_16OC)"
          placeholderTextColor="#666"
        />
        <TouchableOpacity 
          style={styles.button}
          onPress={() => testNormalization(testSpec)}
        >
          <Text style={styles.buttonText}>Test Normalization</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Test Sample Specs</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={testAllSamples}
        >
          <Text style={styles.buttonText}>Test All Sample Specs</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.button, styles.clearButton]}
          onPress={clearResults}
        >
          <Text style={styles.buttonText}>Clear Results</Text>
        </TouchableOpacity>
      </View>

      {results.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Normalization Results</Text>
          {results.map((result, index) => (
            <View key={index} style={styles.resultCard}>
              <Text style={styles.resultTitle}>Result {index + 1}</Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Original:</Text> {result.original}
              </Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Normalized:</Text> {result.normalized}
              </Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Category:</Text> {result.category}
              </Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Species:</Text> {result.species}
              </Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Grade:</Text> {result.grade}
              </Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Treatment:</Text> {result.treatment}
              </Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Purpose:</Text> {result.purpose}
              </Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Dimensions:</Text> {JSON.stringify(result.dimensions)}
              </Text>
              <Text style={styles.resultText}>
                <Text style={styles.label}>Confidence:</Text> {result.confidence.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 8,
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  resultText: {
    fontSize: 14,
    marginBottom: 4,
    color: '#555',
    lineHeight: 20,
  },
  label: {
    fontWeight: '600',
    color: '#333',
  },
});
