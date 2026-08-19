import 'package:cloud_functions/cloud_functions.dart';

import '../models/student_attendance_summary.dart';

class StudentAttendanceService {
  StudentAttendanceService({
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseFunctions _functions;

  Future<StudentAttendanceSummary> loadStudentAttendance({
    required String studentId,
  }) async {
    final result = await _functions.httpsCallable('getMyGuardianAttendance').call<Map<String, dynamic>>({'studentId': studentId});
    final rawRecords = result.data['records'];
    if (rawRecords is! List) throw StateError('استجابة الحضور غير صالحة.');

    final items = rawRecords.whereType<Map>().map((raw) {
      final data = Map<String, dynamic>.from(raw);

      return StudentAttendanceItem(
        id: _readString(data, 'id'),
        studentId: _readString(data, 'studentId'),
        schoolDayId: _readString(data, 'schoolDayId'),
        status: _readString(data, 'status', fallback: 'NOT_RECORDED'),
        recordedAtMs: _readInt(data, 'recordedAt'),
        lateMinutes: _readInt(data, 'lateMinutes'),
        leftEarlyMinutes: _readInt(data, 'leftEarlyMinutes'),
        excuseReason: _readString(data, 'excuseReason'),
        note: _readString(data, 'note'),
      );
    }).toList();

    items.sort((a, b) => b.recordedAtMs.compareTo(a.recordedAtMs));

    var presentCount = 0;
    var absentCount = 0;
    var lateCount = 0;
    var excusedCount = 0;
    var leftEarlyCount = 0;

    for (final item in items) {
      switch (item.status) {
        case 'PRESENT':
        case 'REMOTE_PRESENT':
          presentCount += 1;
          break;

        case 'ABSENT':
        case 'REMOTE_ABSENT':
          absentCount += 1;
          break;

        case 'LATE':
          lateCount += 1;
          break;

        case 'EXCUSED_ABSENT':
        case 'EXCUSED_LATE':
          excusedCount += 1;
          break;

        case 'LEFT_EARLY':
          leftEarlyCount += 1;
          break;
      }
    }

    return StudentAttendanceSummary(
      items: items,
      presentCount: presentCount,
      absentCount: absentCount,
      lateCount: lateCount,
      excusedCount: excusedCount,
      leftEarlyCount: leftEarlyCount,
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
}
