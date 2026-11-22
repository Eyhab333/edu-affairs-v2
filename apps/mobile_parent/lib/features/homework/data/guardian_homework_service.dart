import 'package:cloud_functions/cloud_functions.dart';

class GuardianHomeworkService {
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(region: 'me-central2');

  Future<List<Map<String, dynamic>>> list(String studentId) async {
    final items = <Map<String, dynamic>>[];
    String? cursor;
    do {
      final result = await _functions.httpsCallable('getMyGuardianHomeworks').call<Map<String, dynamic>>({
        'studentId': studentId,
        if (cursor != null) 'cursor': cursor,
      });
      final rows = result.data['items'];
      if (rows is! List) throw StateError('استجابة الواجبات غير صالحة');
      items.addAll(rows.whereType<Map>().map((row) => Map<String, dynamic>.from(row)));
      cursor = result.data['nextCursor'] as String?;
    } while (cursor != null);
    return items;
  }

  Future<Map<String, dynamic>> details(String studentId, String submissionId) async {
    final result = await _functions.httpsCallable('getMyGuardianHomeworkDetails').call<Map<String, dynamic>>({
      'studentId': studentId, 'submissionId': submissionId,
    });
    return result.data;
  }

  Future<void> save(String studentId, String submissionId, List<Map<String, dynamic>> answers, {required bool submit}) async {
    await _functions.httpsCallable(submit ? 'submitMyGuardianHomework' : 'saveMyGuardianHomeworkDraft').call({
      'studentId': studentId, 'submissionId': submissionId, 'answers': answers,
    });
  }
}
