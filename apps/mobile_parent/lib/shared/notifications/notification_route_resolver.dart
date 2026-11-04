String resolveParentNotificationPath({
  String? targetRoute,
  Map<String, Object?> targetParams = const {},
  Map<String, Object?> data = const {},
}) {
  String value(String key) {
    final candidate = targetParams[key] ?? data[key];
    return candidate is String ? candidate.trim() : '';
  }

  switch ((targetRoute ?? value('targetRoute')).trim()) {
    case 'STUDENT_TRANSPORT':
      final studentId = value('studentId');
      if (studentId.isEmpty) return '/notifications';
      final query = <String, String>{'tab': 'transport'};
      final serviceDate = value('serviceDate');
      if (serviceDate.isNotEmpty) query['serviceDate'] = serviceDate;
      return '/students/${Uri.encodeComponent(studentId)}?${Uri(queryParameters: query).query}';
    case 'CHAT_CONVERSATION':
      final threadId = value('threadId');
      return threadId.isEmpty
          ? '/messages'
          : '/messages/${Uri.encodeComponent(threadId)}';
    case 'ANNOUNCEMENT':
      return '/announcements';
    case 'VIRTUAL_CLASS_SESSION':
      final studentId = value('studentId');
      return studentId.isEmpty
          ? '/notifications'
          : '/students/${Uri.encodeComponent(studentId)}';
    case 'FINANCE':
    case 'HOMEWORK_ASSIGNMENT':
    default:
      return '/notifications';
  }
}
