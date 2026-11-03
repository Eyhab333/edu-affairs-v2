class GuardianLearningLossSkill {
  const GuardianLearningLossSkill({
    required this.title,
    required this.description,
    required this.domain,
    required this.severity,
  });

  final String title;
  final String description;
  final String domain;
  final String severity;

  factory GuardianLearningLossSkill.fromMap(Map<String, dynamic> data) =>
      GuardianLearningLossSkill(
        title: _string(data, 'title'),
        description: _string(data, 'description'),
        domain: _string(data, 'domain'),
        severity: _string(data, 'severity'),
      );
}

class GuardianRemediationAction {
  const GuardianRemediationAction({
    required this.title,
    required this.description,
    required this.status,
    required this.dueAtMs,
    required this.completedAtMs,
  });

  final String title;
  final String description;
  final String status;
  final int? dueAtMs;
  final int? completedAtMs;

  factory GuardianRemediationAction.fromMap(Map<String, dynamic> data) =>
      GuardianRemediationAction(
        title: _string(data, 'title'),
        description: _string(data, 'description'),
        status: _string(data, 'status'),
        dueAtMs: _number(data, 'dueAt')?.toInt(),
        completedAtMs: _number(data, 'completedAt')?.toInt(),
      );
}

class GuardianLearningLossPlan {
  const GuardianLearningLossPlan({
    required this.planId,
    required this.studentId,
    required this.subjectKey,
    required this.subjectTitle,
    required this.status,
    required this.sourceType,
    required this.sourceTitle,
    required this.sourceKind,
    required this.planTitle,
    required this.planText,
    required this.planStartAtMs,
    required this.planEndAtMs,
    required this.lostSkills,
    required this.remediationActions,
    required this.baselineScore,
    required this.baselineMaxScore,
    required this.baselineMeasuredAtMs,
    required this.firstCheckScore,
    required this.firstCheckMaxScore,
    required this.firstCheckMeasuredAtMs,
    required this.secondCheckScore,
    required this.secondCheckMaxScore,
    required this.secondCheckMeasuredAtMs,
    required this.improvementIndicator,
    required this.improvementDelta,
    required this.improvementPercentage,
    required this.lastFollowUpAtMs,
    required this.createdAtMs,
    required this.updatedAtMs,
  });

  final String planId;
  final String studentId;
  final String subjectKey;
  final String subjectTitle;
  final String status;
  final String sourceType;
  final String sourceTitle;
  final String sourceKind;
  final String planTitle;
  final String planText;
  final int? planStartAtMs;
  final int? planEndAtMs;
  final List<GuardianLearningLossSkill> lostSkills;
  final List<GuardianRemediationAction> remediationActions;
  final num? baselineScore;
  final num? baselineMaxScore;
  final int? baselineMeasuredAtMs;
  final num? firstCheckScore;
  final num? firstCheckMaxScore;
  final int? firstCheckMeasuredAtMs;
  final num? secondCheckScore;
  final num? secondCheckMaxScore;
  final int? secondCheckMeasuredAtMs;
  final String improvementIndicator;
  final num? improvementDelta;
  final num? improvementPercentage;
  final int? lastFollowUpAtMs;
  final int? createdAtMs;
  final int? updatedAtMs;

  factory GuardianLearningLossPlan.fromMap(Map<String, dynamic> data) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) mapper) {
      final value = data[key];
      if (value is! List) return const [];
      return value
          .whereType<Map>()
          .map((item) => mapper(Map<String, dynamic>.from(item)))
          .toList();
    }

    return GuardianLearningLossPlan(
      planId: _string(data, 'planId'),
      studentId: _string(data, 'studentId'),
      subjectKey: _string(data, 'subjectKey'),
      subjectTitle: _string(data, 'subjectTitle'),
      status: _string(data, 'status'),
      sourceType: _string(data, 'sourceType'),
      sourceTitle: _string(data, 'sourceTitle'),
      sourceKind: _string(data, 'sourceKind'),
      planTitle: _string(data, 'planTitle'),
      planText: _string(data, 'planText'),
      planStartAtMs: _number(data, 'planStartAt')?.toInt(),
      planEndAtMs: _number(data, 'planEndAt')?.toInt(),
      lostSkills: list('lostSkills', GuardianLearningLossSkill.fromMap),
      remediationActions:
          list('remediationActions', GuardianRemediationAction.fromMap),
      baselineScore: _number(data, 'baselineScore'),
      baselineMaxScore: _number(data, 'baselineMaxScore'),
      baselineMeasuredAtMs: _number(data, 'baselineMeasuredAt')?.toInt(),
      firstCheckScore: _number(data, 'firstCheckScore'),
      firstCheckMaxScore: _number(data, 'firstCheckMaxScore'),
      firstCheckMeasuredAtMs:
          _number(data, 'firstCheckMeasuredAt')?.toInt(),
      secondCheckScore: _number(data, 'secondCheckScore'),
      secondCheckMaxScore: _number(data, 'secondCheckMaxScore'),
      secondCheckMeasuredAtMs:
          _number(data, 'secondCheckMeasuredAt')?.toInt(),
      improvementIndicator: _string(data, 'improvementIndicator'),
      improvementDelta: _number(data, 'improvementDelta'),
      improvementPercentage: _number(data, 'improvementPercentage'),
      lastFollowUpAtMs: _number(data, 'lastFollowUpAt')?.toInt(),
      createdAtMs: _number(data, 'createdAt')?.toInt(),
      updatedAtMs: _number(data, 'updatedAt')?.toInt(),
    );
  }
}

String _string(Map<String, dynamic> data, String key) {
  final value = data[key];
  return value is String ? value.trim() : '';
}

num? _number(Map<String, dynamic> data, String key) {
  final value = data[key];
  return value is num ? value : null;
}
