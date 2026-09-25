import type { TableSpec } from './crud.js';

export const TABLES = {
  users: {
    table: 'tenant_users',
    exposeTenantId: true,
    columns: [
      'id', 'userId', 'name', 'email', 'profileId', 'departmentId', 'jobTitle', 'positionId', 'avatarUrl', 'active', 'lastLoginAt',
      'grantedPermissions', 'revokedPermissions'
    ]
  },
  employees: {
    table: 'employees',
    columns: [
      'id', 'name', 'email', 'phone', 'status', 'origin', 'candidateId', 'userId', 'onboardingId', 'developmentId',
      'positionId', 'jobTitle', 'departmentId', 'managerId', 'hireDate', 'createdAt', 'updatedAt', 'createdById', 'createdByName'
    ]
  },
  hrDocuments: {
    table: 'hr_documents',
    columns: ['id', 'employeeId', 'name', 'category', 'issueDate', 'expiresAt', 'status', 'fileName', 'fileMime', 'fileSize', 'filePath', 'notes', 'createdAt', 'updatedAt', 'createdById', 'createdByName']
  },
  hrVacations: {
    table: 'hr_vacation_periods',
    columns: ['id', 'employeeId', 'acquisitionStart', 'acquisitionEnd', 'startDate', 'endDate', 'returnDate', 'days', 'status', 'notes', 'createdAt', 'updatedAt', 'createdById', 'createdByName']
  },
  hrPayroll: {
    table: 'hr_payroll_records',
    columns: ['id', 'employeeId', 'period', 'status', 'admissionEvent', 'vacationEvent', 'leaveEvent', 'overtimeNotes', 'variableNotes', 'notes', 'closedAt', 'createdAt', 'updatedAt', 'createdById', 'createdByName']
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
      'detailedExplanation', 'keyStrengths', 'potentialGaps', 'suggestedInterviewQuestions', 'pillarScores', 'source',
      'humanReviewerDecision', 'humanNotes', 'reviewedBy', 'reviewedAt'
    ]
  },
  resumeScreenings: {
    table: 'resume_screenings',
    json: ['summary', 'analysis'],
    orderBy: 'seq desc',
    columns: [
      'id', 'jobOpeningId', 'candidateId', 'applicationId', 'evaluationId', 'fileName', 'mime', 'sizeBytes',
      'contentHash', 'storagePath', 'status', 'failureCode', 'failureMessage', 'attempts', 'analyzingSince',
      'summary', 'analysis', 'model', 'promptVersion', 'criteriaHash', 'inputTokens', 'outputTokens',
      'uploadedById', 'uploadedByName', 'uploadedAt', 'analyzedAt'
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
    json: ['documents'],
    columns: [
      'id', 'jobOpeningId', 'candidateId', 'baseSalary', 'benefits', 'startDate', 'contractType', 'status',
      'approverId', 'sentAt', 'respondedAt', 'notes', 'documents'
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
      'id', 'collaboratorId', 'collaboratorName', 'jobTitle', 'positionId', 'departmentId', 'managerId', 'hireDate', 'goals',
      'oneOnOnes', 'lastReviewDate', 'nextReviewDate'
    ]
  },
  climateCampaigns: {
    table: 'climate_campaigns',
    json: ['blocks'],
    columns: [
      'id', 'name', 'period', 'description', 'status', 'audience', 'departmentIds', 'closesOn', 'actionPlan', 'blocks',
      'templateName', 'createdById', 'createdByName', 'createdAt', 'publishedAt', 'closedAt'
    ]
  },
  climateSurveys: {
    table: 'climate_surveys',
    json: ['categoryRatings', 'blockAnswers'],
    columns: [
      'id', 'period', 'enpsScore', 'sentiment', 'categoryRatings', 'anonymousComment', 'campaignId', 'departmentId', 'commentHidden',
      'blockAnswers', 'hiddenTexts'
    ]
  },
  surveyTemplates: {
    table: 'survey_templates',
    json: ['blocks'],
    columns: ['id', 'name', 'description', 'focus', 'blocks', 'basedOn', 'createdByName', 'createdAt', 'updatedAt']
  },
  turnoverAlerts: {
    table: 'turnover_alerts',
    json: ['history'],
    columns: [
      'id', 'collaboratorId', 'collaboratorName', 'department', 'departmentId', 'riskLevel', 'earlyWarningSignals',
      'suggestedActions', 'lastActionTaken', 'status', 'ownerId', 'history', 'createdAt', 'createdBy', 'createdById', 'updatedAt', 'resolvedAt',
      'resolutionNote'
    ]
  },
  agendaEvents: {
    table: 'agenda_events',
    orderBy: 'starts_at asc',
    columns: [
      'id', 'type', 'title', 'description', 'status', 'startsAt', 'endsAt', 'location', 'agenda', 'summary',
      'assigneeIds', 'createdById', 'createdByName', 'createdAt'
    ]
  }
} as const satisfies Record<string, TableSpec>;
