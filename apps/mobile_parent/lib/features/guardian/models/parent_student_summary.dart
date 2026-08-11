class ParentStudentSummary {
  
  const ParentStudentSummary({
    required this.orgId,
    required this.studentId,
    required this.studentName,
    required this.relationType,
    required this.schoolId,
    required this.schoolName,
    required this.academicYearId,
    required this.academicYearTitle,
    required this.gradeId,
    required this.gradeTitle,
    required this.classId,
    required this.classTitle,
  });

  final String orgId;
  final String studentId;
  final String studentName;
  final String relationType;

  final String schoolId;
  final String schoolName;

  final String academicYearId;
  final String academicYearTitle;

  final String gradeId;
  final String gradeTitle;

  final String classId;
  final String classTitle;

  factory ParentStudentSummary.fromMap(Map<String, dynamic> data) {
    return ParentStudentSummary(
      orgId: _readString(data, 'orgId'),
      studentId: _readString(data, 'studentId'),
      studentName: _readString(data, 'studentName'),
      relationType: _readString(data, 'relationType', fallback: 'OTHER'),
      schoolId: _readString(data, 'schoolId'),
      schoolName: _readString(data, 'schoolName'),
      academicYearId: _readString(data, 'academicYearId'),
      academicYearTitle: _readString(data, 'academicYearTitle'),
      gradeId: _readString(data, 'gradeId'),
      gradeTitle: _readString(data, 'gradeTitle'),
      classId: _readString(data, 'classId'),
      classTitle: _readString(data, 'classTitle'),
    );
  }

  String get relationLabel {
    switch (relationType) {
      case 'FATHER':
        return 'الأب';
      case 'MOTHER':
        return 'الأم';
      default:
        return 'ولي أمر';
    }
  }

  String get classLine {
    final parts = <String>[
      if (gradeTitle.isNotEmpty) gradeTitle,
      if (classTitle.isNotEmpty) classTitle,
    ];

    if (parts.isEmpty) return 'لم يتم تحديد الفصل بعد';

    return parts.join(' / ');
  }

  static String _readString(
    Map<String, dynamic> data,
    String key, {
    String fallback = '',
  }) {
    final value = data[key];

    if (value is String && value.trim().isNotEmpty) {
      return value.trim();
    }

    return fallback;
  }
}
