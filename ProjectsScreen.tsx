import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useConstructionStore } from "../state/constructionStore";
import { Project } from "../types/construction";

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  defaultLevels: string[];
  buildingCode?: string;
  seismicCategory?: string;
  windCategory?: string;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "residential",
    name: "Residential",
    description: "Single/multi-family homes, townhouses",
    icon: "home",
    color: "#3B82F6",
    defaultLevels: ["Foundation", "First Floor", "Second Floor", "Roof"],
    buildingCode: "IRC",
  },
  {
    id: "commercial",
    name: "Commercial",
    description: "Office buildings, retail, warehouses",
    icon: "business",
    color: "#10B981",
    defaultLevels: ["Ground Floor", "Mezzanine", "Upper Floors", "Roof"],
    buildingCode: "IBC",
    seismicCategory: "D",
    windCategory: "II",
  },
  {
    id: "multifamily",
    name: "Multi-Family",
    description: "Apartments, condos, mixed-use",
    icon: "layers",
    color: "#F59E0B",
    defaultLevels: ["Parking", "Ground Floor", "Typical Floor", "Penthouse", "Roof"],
    buildingCode: "IBC",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Start from scratch with custom settings",
    icon: "construct",
    color: "#8B5CF6",
    defaultLevels: ["Level 1"],
  },
];

export default function ProjectsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { projects, createProject, deleteProject } = useConstructionStore();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [projectLevels, setProjectLevels] = useState<string[]>([]);
  const [buildingCode, setBuildingCode] = useState("");
  const [seismicCategory, setSeismicCategory] = useState("");
  const [windCategory, setWindCategory] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSelectTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setProjectLevels([...template.defaultLevels]);
    setBuildingCode(template.buildingCode || "");
    setSeismicCategory(template.seismicCategory || "");
    setWindCategory(template.windCategory || "");
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      Alert.alert("Error", "Please enter a project name");
      return;
    }
    
    if (!selectedTemplate) {
      Alert.alert("Error", "Please select a project template");
      return;
    }

    try {
      setIsCreating(true);
      
      // Create project with enhanced metadata
      const projectData = {
        name: projectName.trim(),
        address: projectAddress.trim(),
        levels: projectLevels,
        buildingCode,
        seismicCategory,
        windCategory,
        template: selectedTemplate.id,
      };
      
      createProject(projectData.name, projectData.address);
      
      // Note: Enhanced project metadata (levels, building codes) could be stored 
      // in project settings or extended project interface in future updates
      
      // Reset form
      setProjectName("");
      setProjectAddress("");
      setSelectedTemplate(null);
      setProjectLevels([]);
      setBuildingCode("");
      setSeismicCategory("");
      setWindCategory("");
      setShowCreateModal(false);
      
      Alert.alert(
        "Project Created",
        `${projectData.name} has been created successfully. You can now add documents and begin analysis.`
      );
    } catch (error) {
      Alert.alert("Error", "Failed to create project. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = (project: Project) => {
    Alert.alert(
      "Delete Project",
      `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteProject(project.id),
        },
      ]
    );
  };

  const getProjectStatus = (project: Project) => {
    const processedDocs = project.documents.filter(d => d.processed).length;
    const totalDocs = project.documents.length;
    const hasTakeoffs = project.takeoffs.length > 0;
    
    if (totalDocs === 0) return { status: "empty", color: "#9CA3AF", text: "No documents" };
    if (processedDocs === 0) return { status: "pending", color: "#F59E0B", text: "Needs processing" };
    if (processedDocs < totalDocs) return { status: "partial", color: "#3B82F6", text: "In progress" };
    if (!hasTakeoffs) return { status: "ready", color: "#10B981", text: "Ready for takeoff" };
    return { status: "complete", color: "#059669", text: "Complete" };
  };

  const renderProject = ({ item }: { item: Project }) => {
    const status = getProjectStatus(item);
    const lastUpdated = new Date(item.updatedAt).toLocaleDateString();
    
    return (
      <Pressable
        className="bg-white mx-4 mb-3 rounded-xl border border-gray-200"
        style={{ 
          shadowColor: "#000", 
          shadowOffset: { width: 0, height: 2 }, 
          shadowOpacity: 0.1, 
          shadowRadius: 4 
        }}
        onPress={() => navigation.navigate("ProjectDetails", { projectId: item.id })}
      >
        <View className="p-4">
          <View className="flex-row justify-between items-start mb-3">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-semibold text-gray-900 mb-1">
                {item.name}
              </Text>
              {item.address ? (
                <Text className="text-sm text-gray-600 mb-2">{item.address}</Text>
              ) : null}
              
              <View className="flex-row items-center mb-2">
                <View 
                  className="px-2 py-1 rounded-full mr-3"
                  style={{ backgroundColor: `${status.color}20` }}
                >
                  <Text 
                    className="text-xs font-medium"
                    style={{ color: status.color }}
                  >
                    {status.text}
                  </Text>
                </View>
                <Text className="text-xs text-gray-500">
                  Updated {lastUpdated}
                </Text>
              </View>
            </View>
            
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteProject(item);
              }}
              className="p-2 rounded-full"
              style={{ backgroundColor: "#FEF2F2" }}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </Pressable>
          </View>
          
          <View className="flex-row justify-between items-center pt-3 border-t border-gray-100">
            <View className="flex-row items-center">
              <View className="flex-row items-center mr-6">
                <Ionicons name="document-outline" size={16} color="#6B7280" />
                <Text className="text-sm text-gray-600 ml-1">
                  {item.documents.length} docs
                </Text>
              </View>
              <View className="flex-row items-center mr-6">
                <Ionicons name="calculator-outline" size={16} color="#6B7280" />
                <Text className="text-sm text-gray-600 ml-1">
                  {item.takeoffs.length} takeoffs
                </Text>
              </View>
              {item.documents.filter(d => d.processed).length > 0 && (
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text className="text-sm text-green-600 ml-1">
                    {item.documents.filter(d => d.processed).length} processed
                  </Text>
                </View>
              )}
            </View>
            
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <View className="flex-row justify-between items-center px-4 py-3 bg-white border-b border-gray-200">
        <Text className="text-2xl font-bold text-gray-900">Projects</Text>
        <Pressable
          onPress={() => setShowCreateModal(true)}
          className="bg-blue-500 px-4 py-2 rounded-lg flex-row items-center"
        >
          <Ionicons name="add" size={20} color="white" />
          <Text className="text-white font-medium ml-1">New Project</Text>
        </Pressable>
      </View>

      {projects.length === 0 ? (
        <View className="flex-1 justify-center items-center px-8">
          <View className="bg-blue-50 w-24 h-24 rounded-full items-center justify-center mb-6">
            <Ionicons name="construct" size={48} color="#3B82F6" />
          </View>
          <Text className="text-2xl font-bold text-gray-900 mb-3 text-center">
            Welcome to Construction Takeoff
          </Text>
          <Text className="text-gray-600 text-center mb-8 leading-6">
            Create your first project to start analyzing construction documents and generating comprehensive material takeoffs with AI-powered precision.
          </Text>
          
          <View className="w-full max-w-sm">
            <Pressable
              onPress={() => setShowCreateModal(true)}
              className="bg-blue-500 px-6 py-4 rounded-xl mb-4 flex-row items-center justify-center"
              style={{ 
                shadowColor: "#3B82F6", 
                shadowOffset: { width: 0, height: 4 }, 
                shadowOpacity: 0.3, 
                shadowRadius: 8 
              }}
            >
              <Ionicons name="add-circle" size={24} color="white" />
              <Text className="text-white font-semibold text-lg ml-2">Create First Project</Text>
            </Pressable>
            
            <View className="bg-white p-4 rounded-xl border border-gray-200">
              <Text className="font-medium text-gray-900 mb-2">What you can do:</Text>
              <View className="space-y-2">
                <View className="flex-row items-center">
                  <Ionicons name="document-text" size={16} color="#10B981" />
                  <Text className="text-sm text-gray-600 ml-2">Upload PDF drawings & specs</Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="eye" size={16} color="#10B981" />
                  <Text className="text-sm text-gray-600 ml-2">AI-powered document analysis</Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="calculator" size={16} color="#10B981" />
                  <Text className="text-sm text-gray-600 ml-2">Generate detailed takeoffs</Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="download" size={16} color="#10B981" />
                  <Text className="text-sm text-gray-600 ml-2">Export professional reports</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <>
          {/* Quick Stats */}
          <View className="px-4 py-3 bg-white border-b border-gray-100">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row space-x-4">
                <View className="bg-blue-50 px-4 py-2 rounded-lg">
                  <Text className="text-blue-600 font-semibold text-lg">
                    {projects.length}
                  </Text>
                  <Text className="text-blue-600 text-xs">Projects</Text>
                </View>
                <View className="bg-green-50 px-4 py-2 rounded-lg">
                  <Text className="text-green-600 font-semibold text-lg">
                    {projects.reduce((sum, p) => sum + p.documents.length, 0)}
                  </Text>
                  <Text className="text-green-600 text-xs">Documents</Text>
                </View>
                <View className="bg-purple-50 px-4 py-2 rounded-lg">
                  <Text className="text-purple-600 font-semibold text-lg">
                    {projects.reduce((sum, p) => sum + p.takeoffs.length, 0)}
                  </Text>
                  <Text className="text-purple-600 text-xs">Takeoffs</Text>
                </View>
                <View className="bg-orange-50 px-4 py-2 rounded-lg">
                  <Text className="text-orange-600 font-semibold text-lg">
                    {projects.reduce((sum, p) => sum + p.documents.filter(d => d.processed).length, 0)}
                  </Text>
                  <Text className="text-orange-600 text-xs">Processed</Text>
                </View>
              </View>
            </ScrollView>
          </View>

          <FlatList
            data={projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())}
            renderItem={renderProject}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
            <Pressable onPress={() => {
              setShowCreateModal(false);
              setSelectedTemplate(null);
              setProjectName("");
              setProjectAddress("");
            }}>
              <Text className="text-blue-500 text-lg">Cancel</Text>
            </Pressable>
            <Text className="text-lg font-semibold">New Project</Text>
            <Pressable 
              onPress={handleCreateProject}
              disabled={isCreating || !selectedTemplate || !projectName.trim()}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Text className={`text-lg font-medium ${
                  selectedTemplate && projectName.trim() ? "text-blue-500" : "text-gray-400"
                }`}>
                  Create
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView className="flex-1 p-4">
            {!selectedTemplate ? (
              <>
                <Text className="text-gray-700 font-medium mb-4">Choose Project Type</Text>
                {PROJECT_TEMPLATES.map((template) => (
                  <Pressable
                    key={template.id}
                    onPress={() => handleSelectTemplate(template)}
                    className="bg-white border border-gray-200 rounded-lg p-4 mb-3"
                    style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 }}
                  >
                    <View className="flex-row items-center">
                      <View 
                        className="w-12 h-12 rounded-full items-center justify-center mr-4"
                        style={{ backgroundColor: `${template.color}20` }}
                      >
                        <Ionicons name={template.icon} size={24} color={template.color} />
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900 mb-1">{template.name}</Text>
                        <Text className="text-sm text-gray-600">{template.description}</Text>
                        {template.buildingCode && (
                          <Text className="text-xs text-gray-500 mt-1">
                            Code: {template.buildingCode}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </View>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => setSelectedTemplate(null)}
                  className="flex-row items-center mb-4"
                >
                  <Ionicons name="chevron-back" size={20} color="#3B82F6" />
                  <Text className="text-blue-500 ml-1">Back to Templates</Text>
                </Pressable>

                <View className="bg-gray-50 p-4 rounded-lg mb-4">
                  <View className="flex-row items-center">
                    <View 
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: `${selectedTemplate.color}20` }}
                    >
                      <Ionicons name={selectedTemplate.icon} size={20} color={selectedTemplate.color} />
                    </View>
                    <View>
                      <Text className="font-medium text-gray-900">{selectedTemplate.name}</Text>
                      <Text className="text-sm text-gray-600">{selectedTemplate.description}</Text>
                    </View>
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-gray-700 font-medium mb-2">Project Name *</Text>
                  <TextInput
                    value={projectName}
                    onChangeText={setProjectName}
                    placeholder="Enter project name"
                    className="border border-gray-300 rounded-lg px-3 py-3 text-base"
                    autoFocus
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-gray-700 font-medium mb-2">Address</Text>
                  <TextInput
                    value={projectAddress}
                    onChangeText={setProjectAddress}
                    placeholder="Enter project address (optional)"
                    className="border border-gray-300 rounded-lg px-3 py-3 text-base"
                    multiline
                    numberOfLines={2}
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-gray-700 font-medium mb-2">Building Levels</Text>
                  <View className="bg-gray-50 p-3 rounded-lg">
                    {projectLevels.map((level, index) => (
                      <Text key={index} className="text-gray-700 py-1">
                        • {level}
                      </Text>
                    ))}
                  </View>
                </View>

                {buildingCode && (
                  <View className="mb-4">
                    <Text className="text-gray-700 font-medium mb-2">Building Code</Text>
                    <Text className="text-gray-600 bg-gray-50 p-3 rounded-lg">{buildingCode}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}