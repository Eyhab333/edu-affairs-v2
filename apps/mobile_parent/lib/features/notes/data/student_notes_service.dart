import 'package:cloud_functions/cloud_functions.dart';

import '../models/student_notes_summary.dart';

class StudentNotesService {
  StudentNotesService({
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseFunctions _functions;

  Future<StudentNotesSummary> loadStudentNotes({
    required String studentId,
  }) async {
    final result = await _functions.httpsCallable('getMyGuardianNotes').call<Map<String, dynamic>>({'studentId': studentId});
    final rawNotes = result.data['notes'];
    if (rawNotes is! List) throw StateError('استجابة الملاحظات غير صالحة.');

    final items = <StudentNoteItem>[];

    for (final raw in rawNotes.whereType<Map>()) {
      final data = Map<String, dynamic>.from(raw);

      final item = StudentNoteItem(
        id: _readString(data, 'id'),
        studentId: _readString(data, 'studentId'),
        title: _readString(data, 'title', fallback: 'ملاحظة'),
        body: _readString(data, 'body'),
        noteType: _readString(data, 'noteType', fallback: 'NOTE'),
        severity: _readString(data, 'severity', fallback: 'NORMAL'),
        status: _readString(data, 'status', fallback: 'ACTIVE'),
        visibility: _readString(data, 'visibility'),
        followUpStatus: _readString(
          data,
          'followUpStatus',
          fallback: 'NONE',
        ),
        noteAtMs: _readInt(data, 'noteAt'),
        createdByRoleKey: _readString(data, 'createdByRoleKey'),
        tags: _readStringList(data, 'tags'),
      );

      items.add(item);
    }

    items.sort((a, b) => b.noteAtMs.compareTo(a.noteAtMs));

    var positiveCount = 0;
    var academicCount = 0;
    var followUpCount = 0;

    for (final item in items) {
      if (item.isPositive) {
        positiveCount += 1;
      }

      if (item.isAcademic) {
        academicCount += 1;
      }

      if (item.needsFollowUp) {
        followUpCount += 1;
      }
    }

    return StudentNotesSummary(
      items: items,
      positiveCount: positiveCount,
      academicCount: academicCount,
      followUpCount: followUpCount,
    );
  }

  String _readString(
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

  int _readInt(Map<String, dynamic> data, String key) {
    final value = data[key];

    if (value is int) return value;

    if (value is double) return value.toInt();

    if (value is DateTime) return value.millisecondsSinceEpoch;

    return 0;
  }

  List<String> _readStringList(Map<String, dynamic> data, String key) {
    final value = data[key];

    if (value is List) {
      return value
          .whereType<String>()
          .map((item) => item.trim())
          .where((item) => item.isNotEmpty)
          .toList();
    }

    return [];
  }
}
