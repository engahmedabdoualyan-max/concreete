/**
 * R&D Module Type Definitions
 * Types for Research & Development mobile module
 */

// ─── Current State Analysis ───────────────────────────────────────────────────

export interface CurrentState {
  id: string;
  tenantId: string;
  period: string; // e.g., "2026-Q1"
  
  // Production metrics
  currentProductionCapacity: number; // m³/month
  targetProductionCapacity: number; // m³/month
  currentEfficiency: number; // percentage
  targetEfficiency: number; // percentage
  
  // Staff metrics
  currentStaffCount: number;
  targetStaffCount: number;
  
  // Cost metrics
  currentCostPerM3: number; // SAR
  targetCostPerM3: number; // SAR
  
  // Issues
  keyIssues: KeyIssue[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface KeyIssue {
  id: string;
  title: string;
  description: string;
  category: 'production' | 'quality' | 'cost' | 'staff' | 'equipment' | 'process' | 'safety' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  impact: string; // Description of business impact
  reportedAt: string;
  reportedBy: string;
}

// ─── Development Plan ─────────────────────────────────────────────────────────

export type PlanCategory = 
  | 'production'  // تحسين الإنتاج
  | 'quality'     // تحسين الجودة
  | 'cost'        // تقليل التكاليف
  | 'staff'       // تطوير الكوادر
  | 'technology'  // تبني التكنولوجيا
  | 'process';    // تحسين العمليات

export type PlanPriority = 'high' | 'medium' | 'low';

export type PlanStatus = 
  | 'draft' 
  | 'pending_finance' 
  | 'approved' 
  | 'in_progress' 
  | 'completed' 
  | 'rejected';

export interface DevelopmentPlan {
  id: string;
  tenantId: string;
  
  title: string;
  description: string;
  category: PlanCategory;
  priority: PlanPriority;
  status: PlanStatus;
  
  startDate: string;
  endDate: string;
  durationMonths: number;
  
  budget: number; // SAR
  expectedROI: number; // percentage
  
  // Milestones
  milestones: Milestone[];
  
  // Finance approval
  financeApproval?: FinanceApproval;
  
  // Assignment
  createdBy: string;
  approvedBy?: string;
  
  // Progress tracking
  overallProgress: number; // percentage
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  planId: string;
  title: string;
  description: string;
  targetDate: string;
  actualDate?: string;
  ownerId: string; // Responsible person
  status: 'pending' | 'in_progress' | 'completed' | 'delayed';
  progress: number; // percentage
  createdAt: string;
  updatedAt: string;
}

export interface FinanceApproval {
  id: string;
  planId: string;
  requestedAt: string;
  requestedBy: string;
  reviewedAt?: string;
  reviewedBy?: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  approvedBudget?: number;
}

// ─── Task Assignment ──────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface RnDTask {
  id: string;
  tenantId: string;
  planId?: string; // Optional - can be standalone task
  
  title: string;
  description: string;
  
  assigneeId: string;
  assigneeName: string;
  assigneeRole: string;
  
  startDate: string;
  dueDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  
  status: TaskStatus;
  priority: TaskPriority;
  progress: number; // percentage
  
  estimatedHours?: number;
  actualHours?: number;
  
  // Dependencies
  dependencies: string[]; // Task IDs
  
  // Comments & Collaboration
  comments: TaskComment[];
  attachments: TaskAttachment[];
  
  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

// ─── Budget Planning ──────────────────────────────────────────────────────────

export type BudgetCategory = 
  | 'equipment'      // معدات وآلات
  | 'software'       // برمجيات وتراخيص
  | 'training'       // التدريب والتطوير
  | 'consulting'     // خدمات استشارية
  | 'marketing'      // التسويق والترويج
  | 'hr'             // الموارد البشرية (تعيين/استبدال)
  | 'materials'      // اختبار المواد الخام
  | 'other';         // أخرى

export type BudgetItemStatus = 'planned' | 'requested' | 'approved' | 'ordered' | 'received' | 'cancelled';

export interface BudgetPlan {
  id: string;
  tenantId: string;
  planId?: string; // Linked development plan
  
  totalBudget: number; // SAR
  allocatedBudget: number; // SAR
  spentBudget: number; // SAR
  
  items: BudgetItem[];
  
  fiscalYear: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetItem {
  id: string;
  budgetPlanId: string;
  
  name: string;
  description: string;
  category: BudgetCategory;
  
  estimatedCost: number; // SAR
  actualCost?: number; // SAR
  
  vendor?: string;
  
  status: BudgetItemStatus;
  financeApprovalRequired: boolean;
  financeApproval?: FinanceApproval;
  
  requestedAt?: string;
  approvedAt?: string;
  orderedAt?: string;
  receivedAt?: string;
  
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Weekly Tracking ──────────────────────────────────────────────────────────

export interface WeeklyTracking {
  id: string;
  tenantId: string;
  planId: string;
  
  weekNumber: number; // 1-52
  year: number;
  weekStartDate: string;
  weekEndDate: string;
  
  plannedTarget: number; // Target for this week (m³ or %)
  actualAchieved: number; // Actual achieved
  variance: number; // percentage
  
  isOnTrack: boolean;
  
  blockers: string; // Issues preventing progress
  actionsTaken: string; // What was done to address blockers
  nextWeekPlan: string; // Plan for next week
  
  // Metrics snapshot
  metricsSnapshot: {
    productionVolume?: number;
    efficiency?: number;
    qualityScore?: number;
    costPerM3?: number;
    staffUtilization?: number;
  };
  
  submittedBy: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// ─── External Issues (Problems outside plan) ──────────────────────────────────

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueCategory = 'equipment' | 'quality' | 'safety' | 'staff' | 'supplier' | 'other';
export type IssueStatus = 'open' | 'investigating' | 'resolving' | 'resolved' | 'closed';

export interface ExternalIssue {
  id: string;
  tenantId: string;
  
  title: string;
  description: string;
  
  severity: IssueSeverity;
  category: IssueCategory;
  
  reportedBy: string;
  reportedByName: string;
  reportedAt: string;
  
  assignedTo?: string;
  assignedToName?: string;
  assignedAt?: string;
  
  status: IssueStatus;
  
  // Resolution
  rootCause?: string;
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  
  // Related plan/task (if escalated)
  relatedPlanId?: string;
  relatedTaskId?: string;
  
  // Comments
  comments: IssueComment[];
  
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  id: string;
  issueId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

// ─── Employee Evaluation ──────────────────────────────────────────────────────

export interface EmployeeEvaluation {
  id: string;
  tenantId: string;
  
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  
  periodStart: string;
  periodEnd: string;
  
  tasksAssigned: number;
  tasksCompleted: number;
  completionRate: number; // percentage
  
  qualityScore: number; // 1-10
  initiativeScore: number; // 1-10
  teamworkScore: number; // 1-10
  overallScore: number; // calculated average
  
  strengths: string;
  improvements: string;
  reviewerComments: string;
  
  evaluatedBy: string;
  evaluatedByName: string;
  evaluatedAt: string;
  
  // Acknowledgment
  acknowledgedByEmployee?: boolean;
  acknowledgedAt?: string;
  
  createdAt: string;
  updatedAt: string;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface RndDashboardData {
  currentState?: CurrentState;
  activePlans: DevelopmentPlan[];
  myTasks: RnDTask[];
  pendingApprovals: DevelopmentPlan[]; // For finance managers
  recentWeeklyEntries: WeeklyTracking[];
  openExternalIssues: ExternalIssue[];
  teamEvaluations: EmployeeEvaluation[];
  
  // KPIs
  kpis: {
    totalActivePlans: number;
    plansOnTrack: number;
    plansAtRisk: number;
    totalBudgetAllocated: number;
    totalBudgetSpent: number;
    budgetUtilization: number; // percentage
    openIssuesCount: number;
    criticalIssuesCount: number;
    avgTeamPerformance: number;
  };
}

export interface PlanProgressReport {
  plan: DevelopmentPlan;
  milestones: Milestone[];
  tasks: RnDTask[];
  weeklyTracking: WeeklyTracking[];
  budgetUtilization: {
    total: number;
    spent: number;
    remaining: number;
    percentage: number;
  };
  overallProgress: number;
  riskLevel: 'low' | 'medium' | 'high';
  predictedCompletionDate?: string;
}

// ─── Filter/Sort Types ────────────────────────────────────────────────────────

export interface RndFilters {
  status?: PlanStatus | TaskStatus | IssueStatus;
  category?: PlanCategory | BudgetCategory | IssueCategory;
  priority?: PlanPriority | TaskPriority | IssueSeverity;
  assigneeId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export type SortField = 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'status' | 'progress';
export type SortOrder = 'asc' | 'desc';

export interface RndSort {
  field: SortField;
  order: SortOrder;
}

// ─── Competitor Intelligence (المصانع المنافسة) ───────────────────────────────

export interface Competitor {
  id: string;
  tenantId: string;
  name: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PriceVerdict = 'CHEAPER' | 'EQUAL' | 'PRICIER' | 'UNKNOWN';

export interface CompetitorProduct {
  id: string;
  tenantId: string;
  competitorId: string;
  competitorName?: string;
  grade: string;              // e.g. "C30"
  productName?: string;
  theirPriceSar: number;      // سعرهم
  ourMixDesignId?: string;
  ourMixCode?: string;
  ourPriceSar: number;        // سعرنا
  extrasNote?: string;
  observedAt?: string;
  source?: string;
  notes?: string;
  // Computed by backend:
  diffSar?: number;           // their - ours (positive → we are cheaper)
  diffPct?: number;
  verdict?: PriceVerdict;
}

export interface PriceComparison {
  products: CompetitorProduct[];
  summary: {
    total: number;
    comparable: number;
    cheaper: number;
    pricier: number;
    equal: number;
  };
  byGrade: {
    grade: string;
    lowestRival: number;
    lowestRivalBy: string;
    ourPrice: number;
    rows: number;
  }[];
}