class StudentMeasurementItem {
  const StudentMeasurementItem({
    required this.batchId,
    required this.recordId,
    required this.dateMs,
    required this.title,
    required this.type,
    required this.subject,
    required this.batchKind,
    required this.assessmentKind,
    required this.trackerKind,
    required this.assessmentSlot,
    required this.subjectKey,
    required this.score,
    required this.maxScore,
    required this.percentage,
    required this.level,
    required this.result,
    required this.valueText,
    required this.status,
    required this.isCompensation,
  });

  final String batchId;
  final String recordId;
  final int? dateMs;
  final String title;
  final String type;
  final String subject;
  final String batchKind;
  final String assessmentKind;
  final String trackerKind;
  final String assessmentSlot;
  final String subjectKey;
  final num? score;
  final num? maxScore;
  final num? percentage;
  final String level;
  final String result;
  final String valueText;
  final String status;
  final bool isCompensation;

  factory StudentMeasurementItem.fromMap(Map<String, dynamic> data) {
    String readString(String key) {
      final value = data[key];
      return value is String ? value.trim() : '';
    }

    num? readNumber(String key) {
      final value = data[key];
      return value is num ? value : null;
    }

    return StudentMeasurementItem(
      batchId: readString('batchId'),
      recordId: readString('recordId'),
      dateMs: readNumber('date')?.toInt(),
      title: readString('title'),
      type: readString('type'),
      subject: readString('subject'),
      batchKind: readString('batchKind'),
      assessmentKind: readString('assessmentKind'),
      trackerKind: readString('trackerKind'),
      assessmentSlot: readString('assessmentSlot'),
      subjectKey: readString('subjectKey'),
      score: readNumber('score'),
      maxScore: readNumber('maxScore'),
      percentage: readNumber('percentage'),
      level: readString('level'),
      result: readString('result'),
      valueText: readString('valueText'),
      status: readString('status'),
      isCompensation: data['isCompensation'] == true,
    );
  }

  String get displayTitle => title.isEmpty ? 'قياس' : title;

  String get dateLabel {
    if (dateMs == null || dateMs! <= 0) return '';

    final date = DateTime.fromMillisecondsSinceEpoch(dateMs!);
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }

  String get scoreLabel {
    if (score == null) return '';
    if (maxScore == null) return _formatNumber(score!);
    return '${_formatNumber(score!)} / ${_formatNumber(maxScore!)}';
  }

  String get percentageLabel {
    if (percentage == null) return '';
    return '${percentage!.toStringAsFixed(0)}%';
  }

  static String _formatNumber(num value) {
    if (value == value.roundToDouble()) return value.toInt().toString();
    return value.toString();
  }
}
