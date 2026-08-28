import 'package:cloud_functions/cloud_functions.dart';

class StudentGamificationService {
  StudentGamificationService({FirebaseFunctions? functions})
      : _functions = functions ??
            FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseFunctions _functions;

  Future<List<Map<String, dynamic>>> loadStudentGamification({
    required String studentId,
  }) async {
    final result = await _functions
        .httpsCallable('getMyGuardianGamification')
        .call<Map<String, dynamic>>({'studentId': studentId});

    final rawEvents = result.data['events'];
    if (rawEvents is! List) {
      throw StateError('استجابة التحفيز غير صالحة.');
    }

    return rawEvents
        .whereType<Map>()
        .map((event) => Map<String, dynamic>.from(event))
        .toList();
  }
}
