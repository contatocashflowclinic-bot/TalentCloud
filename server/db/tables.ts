import type { TableSpec } from './crud.js';

export const TABLES = {
  users: {
    table: 'tenant_users',
    exposeTenantId: true,
    columns: [
      'id', 'userId', 'name', 'email', 'profileId', 'departmentId', 'jobTitle', 'avatarUrl', 'active', 'lastLoginAt',
      'grantedPermissions', 'revokedPermissions'
    ]
  },
  departments: {
    table: 'departments',
    columns: ['id', 'name', 'code', 'parentId', 'managerId', 'costCenter', 'headcountTarget', 'currentHeadcount']
  },
  positions: {
    table: 'job_positions',
    columns: [
      'id', 'title', 'departmentId', 'level', 'description', 'technicalRequirements', 'behavioralCompetencies',
      'minSalary', 'maxSalary', 'currency', 'careerTrack', 'status'
    ]
  },
  openings: {
    table: 'job_openings',
    json: ['stages'],
    columns: [
      'id', 'positionId', 'title', 'departmentId', 'hiringManagerId', 'recruiterId', 'status', 'openingsCount',
      'filledCount', 'workModel', 'location', 'slaDays', 'openedAt', 'targetFillDate', 'stages', 'customQuestions',
      'salaryOfferedMin', 'salaryOfferedMax'
    ]
  },
  candidates: {
    table: 'candidates',
    columns: [
      'id', 'name', 'email', 'phone', 'location', 'linkedinUrl', 'currentRole', 'yearsOfExperience', 'education',
      'resumeSummary', 'skills', 'languages', 'registeredAt', 'tags', 'dataOrigin', 'archived'
    ]
  },
  candidateChanges: {
    table: 'candidate_changes',
    json: ['oldValue', 'newValue'],
    orderBy: 'seq desc',
    columns: ['id', 'candidateId', 'field', 'oldValue', 'newValue', 'kind', 'reason', 'changedBy', 'changedById', 'changedAt']
  },
  applications: {
    table: 'selection_applications',
    columns: ['id', 'jobOpeningId', 'candidateId', 'currentStageId', 'status', 'appliedAt', 'notes', 'aiEvaluationId']
  },
  aiEvaluations: {
    table: 'ai_evaluations',
    json: ['pillarScores'],
    orderBy: 'seq desc',
    columns: [
      'id', 'candidateId', 'jobOpeningId', 'evaluatedAt', 'overallFitScore', 'technicalFitScore', 'culturalFitScore',
      'detailedExplanation', 'keyStrengths', 'potentialGaps', 'suggestedInterviewQuestions', 'pillarScores',
      'humanReviewerDecision', 'humanNotes', 'reviewedBy', 'reviewedAt'
    ]
  },
  interviews: {
    table: 'interview_sessions',
    json: ['scorecard'],
    columns: [
      'id', 'jobOpeningId', 'candidateId', 'stageName', 'scheduledFor', 'interviewerIds', 'durationMinutes', 'meetLink',
      'status', 'structuredScript', 'scorecard', 'interviewerRecommendation', 'overallFeedback'
    ]
  },
  offers: {
    table: 'job_offers',
    columns: [
      'id', 'jobOpeningId', 'candidateId', 'baseSalary', 'benefits', 'startDate', 'contractType', 'status',
      'approverId', 'sentAt', 'respondedAt', 'notes'
    ]
  },
  benefits: {
    table: 'benefit_catalog',
    columns: ['id', 'name', 'category', 'description', 'active', 'defaultLevels']
  },
  integrationTemplates: {
    table: 'integration_templates',
    columns: ['id', 'name', 'category', 'responsible', 'dueDay', 'active']
  },
  admissionTemplates: {
    table: 'admission_templates',
    columns: [
      'id', 'name', 'category', 'description', 'required', 'requiresDocument', 'responsible', 'dueDaysBeforeStart',
      'contractTypes', 'active'
    ]
  },
  onboardings: {
    table: 'onboarding_journeys',
    json: ['checklists', 'admission'],
    columns: [
      'id', 'candidateId', 'candidateName', 'jobTitle', 'departmentId', 'mentorId', 'hireDate', 'status', 'checklists',
      'admission', 'milestones30DaysDone', 'milestones60DaysDone', 'milestones90DaysDone', 'notes'
    ]
  },
  development: {
    table: 'collaborator_development',
    json: ['goals', 'oneOnOnes'],
    columns: [
      'id', 'collaboratorId', 'collaboratorName', 'jobTitle', 'departmentId', 'managerId', 'hireDate', 'goals',
      'oneOnOnes', 'lastReviewDate', 'nextReviewDate'
    ]
  },
  climateSurveys: {
    table: 'climate_surveys',
    json: ['categoryRatings'],
    columns: ['id', 'period', 'enpsScore', 'sentiment', 'categoryRatings', 'anonymousComment']
  },
  turnoverAlerts: {
    table: 'turnover_alerts',
    columns: [
      'id', 'collaboratorId', 'collaboratorName', 'department', 'riskLevel', 'earlyWarningSignals', 'suggestedActions',
      'lastActionTaken'
    ]
  }
} as const satisfies Record<string, TableSpec>;
