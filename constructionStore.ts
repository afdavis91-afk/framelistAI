import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createRobustJSONStorage, validateConstructionState } from '../utils/storageUtils';
import { Project, Takeoff, ProjectDocument, ConstructionStandards, StepTraceEvent } from '../types/construction';

interface ConstructionState {
  // Projects
  projects: Project[];
  currentProject: Project | null;
  
  // Documents
  isProcessingDocument: boolean;
  processingProgress: number;
  
  // Standards and defaults
  constructionStandards: ConstructionStandards;

  // Processing traces (non-persisted)
  processingTraces: Record<string, StepTraceEvent[]>;
  
  // Actions
  createProject: (name: string, address: string) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (project: Project | null) => void;
  
  addDocument: (projectId: string, document: Omit<ProjectDocument, 'id'>) => string;
  updateDocument: (documentId: string, updates: Partial<ProjectDocument>) => void;
  removeDocument: (documentId: string) => void;
  
  addTakeoff: (projectId: string, takeoff: Omit<Takeoff, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTakeoff: (takeoffId: string, updates: Partial<Takeoff>) => void;
  deleteTakeoff: (takeoffId: string) => void;
  
  setProcessingStatus: (isProcessing: boolean, progress?: number) => void;
  updateConstructionStandards: (standards: Partial<ConstructionStandards>) => void;

  // Trace actions (non-persisted)
  appendTrace: (documentId: string, event: StepTraceEvent) => void;
  clearTrace: (documentId: string) => void;
}

const defaultConstructionStandards: ConstructionStandards = {
  studSpacingDefault: 16, // inches
  cornerStudCount: 3,
  tIntersectionStudCount: 2,
  headerBearing: 1.5, // inches each side
  wasteFactors: {
    studsPct: 10,
    platesPct: 5,
    sheathingPct: 10,
    blockingPct: 15,
    fastenersPct: 5,
  },
};

export const useConstructionStore = create<ConstructionState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProject: null,
      isProcessingDocument: false,
      processingProgress: 0,
      constructionStandards: defaultConstructionStandards,
      processingTraces: {},

      createProject: (name: string, address: string) => {
        const id = `project_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const newProject: Project = {
          id,
          name,
          address,
          createdAt: new Date(),
          updatedAt: new Date(),
          levels: [],
          documents: [],
          takeoffs: [],
        };
        
        set((state) => ({
          projects: [...state.projects, newProject],
        }));
        
        return id;
      },

      updateProject: (id: string, updates: Partial<Project>) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === id
              ? { ...project, ...updates, updatedAt: new Date() }
              : project
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates, updatedAt: new Date() }
              : state.currentProject,
        }));
      },

      deleteProject: (id: string) => {
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== id),
          currentProject: state.currentProject?.id === id ? null : state.currentProject,
        }));
      },

      setCurrentProject: (project: Project | null) => {
        set({ currentProject: project });
      },

      addDocument: (projectId: string, document: Omit<ProjectDocument, 'id'>) => {
        const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const newDocument: ProjectDocument = {
          ...document,
          id,
        };

        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  documents: [...project.documents, newDocument],
                  updatedAt: new Date(),
                }
              : project
          ),
          currentProject:
            state.currentProject?.id === projectId
              ? {
                  ...state.currentProject,
                  documents: [...state.currentProject.documents, newDocument],
                  updatedAt: new Date(),
                }
              : state.currentProject,
        }));

        return id;
      },

      updateDocument: (documentId: string, updates: Partial<ProjectDocument>) => {
        set((state) => ({
          projects: state.projects.map((project) => ({
            ...project,
            documents: project.documents.map((doc) =>
              doc.id === documentId ? { ...doc, ...updates } : doc
            ),
            updatedAt: project.documents.some((doc) => doc.id === documentId)
              ? new Date()
              : project.updatedAt,
          })),
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                documents: state.currentProject.documents.map((doc) =>
                  doc.id === documentId ? { ...doc, ...updates } : doc
                ),
                updatedAt: state.currentProject.documents.some((doc) => doc.id === documentId)
                  ? new Date()
                  : state.currentProject.updatedAt,
              }
            : null,
        }));
      },

      removeDocument: (documentId: string) => {
        set((state) => ({
          projects: state.projects.map((project) => ({
            ...project,
            documents: project.documents.filter((doc) => doc.id !== documentId),
            updatedAt: project.documents.some((doc) => doc.id === documentId)
              ? new Date()
              : project.updatedAt,
          })),
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                documents: state.currentProject.documents.filter((doc) => doc.id !== documentId),
                updatedAt: state.currentProject.documents.some((doc) => doc.id === documentId)
                  ? new Date()
                  : state.currentProject.updatedAt,
              }
            : null,
        }));
      },

      addTakeoff: (projectId: string, takeoff: Omit<Takeoff, 'id' | 'createdAt' | 'updatedAt'>) => {
        const id = `takeoff_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const now = new Date();
        const newTakeoff: Takeoff = {
          ...takeoff,
          id,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  takeoffs: [...project.takeoffs, newTakeoff],
                  updatedAt: new Date(),
                }
              : project
          ),
          currentProject:
            state.currentProject?.id === projectId
              ? {
                  ...state.currentProject,
                  takeoffs: [...state.currentProject.takeoffs, newTakeoff],
                  updatedAt: new Date(),
                }
              : state.currentProject,
        }));

        return id;
      },

      updateTakeoff: (takeoffId: string, updates: Partial<Takeoff>) => {
        set((state) => ({
          projects: state.projects.map((project) => ({
            ...project,
            takeoffs: project.takeoffs.map((takeoff) =>
              takeoff.id === takeoffId
                ? { ...takeoff, ...updates, updatedAt: new Date() }
                : takeoff
            ),
            updatedAt: project.takeoffs.some((takeoff) => takeoff.id === takeoffId)
              ? new Date()
              : project.updatedAt,
          })),
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                takeoffs: state.currentProject.takeoffs.map((takeoff) =>
                  takeoff.id === takeoffId
                    ? { ...takeoff, ...updates, updatedAt: new Date() }
                    : takeoff
                ),
                updatedAt: state.currentProject.takeoffs.some((takeoff) => takeoff.id === takeoffId)
                  ? new Date()
                  : state.currentProject.updatedAt,
              }
            : null,
        }));
      },

      deleteTakeoff: (takeoffId: string) => {
        set((state) => ({
          projects: state.projects.map((project) => ({
            ...project,
            takeoffs: project.takeoffs.filter((takeoff) => takeoff.id !== takeoffId),
            updatedAt: project.takeoffs.some((takeoff) => takeoff.id === takeoffId)
              ? new Date()
              : project.updatedAt,
          })),
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                takeoffs: state.currentProject.takeoffs.filter((takeoff) => takeoff.id !== takeoffId),
                updatedAt: state.currentProject.takeoffs.some((takeoff) => takeoff.id === takeoffId)
                  ? new Date()
                  : state.currentProject.updatedAt,
              }
            : null,
        }));
      },

      setProcessingStatus: (isProcessing: boolean, progress = 0) => {
        set({ isProcessingDocument: isProcessing, processingProgress: progress });
      },

      updateConstructionStandards: (standards: Partial<ConstructionStandards>) => {
        set((state) => ({
          constructionStandards: { ...state.constructionStandards, ...standards },
        }));
      },

      appendTrace: (documentId: string, event: StepTraceEvent) => {
        const current = get().processingTraces[documentId] || [];
        set({ processingTraces: { ...get().processingTraces, [documentId]: [...current, event] } });
      },

      clearTrace: (documentId: string) => {
        const traces = { ...get().processingTraces };
        delete traces[documentId];
        set({ processingTraces: traces });
      },
    }),
    {
      name: 'construction-storage',
      version: 2,
      migrate: async (persistedState: any, _fromVersion: number) => {
        try {
          if (!persistedState || typeof persistedState !== 'object') return persistedState;
          const state = { ...persistedState };
          if (Array.isArray(state.projects)) {
            state.projects = state.projects.map((project: any) => {
              if (!Array.isArray(project.takeoffs)) return project;
              const takeoffs = project.takeoffs.map((t: any) => {
                const upgraded: any = { ...t };
                if (!Array.isArray(upgraded.lineItems) && Array.isArray(upgraded.takeoff)) {
                  upgraded.lineItems = upgraded.takeoff;
                  delete upgraded.takeoff;
                }
                if (!upgraded.id) {
                  upgraded.id = `takeoff_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
                }
                if (!upgraded.createdAt) upgraded.createdAt = new Date().toISOString();
                if (!upgraded.updatedAt) upgraded.updatedAt = new Date().toISOString();
                if (!Array.isArray(upgraded.flags)) upgraded.flags = [];
                if (!Array.isArray(upgraded.lineItems)) upgraded.lineItems = [];
                return upgraded;
              });
              return { ...project, takeoffs };
            });
          }
          return state;
        } catch (e) {
          console.warn('[ConstructionStore] migrate failed, returning original state', e);
          return persistedState;
        }
      },
      storage: createJSONStorage(() => createRobustJSONStorage({
        validateState: validateConstructionState,
        onError: (error, key) => {
          console.warn(`[ConstructionStore] Storage error for ${key}:`, error.message);
        }
      })),
      partialize: (state) => ({
        projects: state.projects,
        constructionStandards: state.constructionStandards,
        // Note: processingTraces intentionally not persisted
      }),
    }
  )
);
