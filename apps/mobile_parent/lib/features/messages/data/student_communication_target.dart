class StudentCommunicationTarget {
  const StudentCommunicationTarget({
    required this.id,
    required this.targetKind,
    required this.title,
    required this.subtitle,
    required this.targetUid,
    required this.targetPersonId,
    required this.targetRoleKey,
    required this.targetDisplayName,
    required this.subjectKey,
    required this.subjectTitle,
    required this.classSubjectOfferingId,
    required this.assignmentId,
  });

  final String id;
  final String targetKind;
  final String title;
  final String subtitle;

  final String targetUid;
  final String targetPersonId;
  final String targetRoleKey;
  final String targetDisplayName;

  final String subjectKey;
  final String subjectTitle;
  final String classSubjectOfferingId;
  final String assignmentId;

  factory StudentCommunicationTarget.fromMap(Map<String, dynamic> data) {
    return StudentCommunicationTarget(
      id: _readString(data, 'id'),
      targetKind: _readString(data, 'targetKind'),
      title: _readString(data, 'title'),
      subtitle: _readString(data, 'subtitle'),
      targetUid: _readString(data, 'targetUid'),
      targetPersonId: _readString(data, 'targetPersonId'),
      targetRoleKey: _readString(data, 'targetRoleKey'),
      targetDisplayName: _readString(data, 'targetDisplayName'),
      subjectKey: _readString(data, 'subjectKey'),
      subjectTitle: _readString(data, 'subjectTitle'),
      classSubjectOfferingId: _readString(data, 'classSubjectOfferingId'),
      assignmentId: _readString(data, 'assignmentId'),
    );
  }
}

String _readString(Map<String, dynamic> data, String key) {
  final value = data[key];

  if (value is String && value.trim().isNotEmpty) {
    return value.trim();
  }

  return '';
}