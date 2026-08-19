import 'package:cloud_functions/cloud_functions.dart';

class StudentVirtualClassesService {
  StudentVirtualClassesService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseFunctions _functions;

  Future<List<Map<String, dynamic>>> loadStudentVirtualClasses({
    required String studentId,
  }) async {
    final result = await _functions.httpsCallable('getMyGuardianVirtualClasses').call<Map<String, dynamic>>({'studentId': studentId});
    final rawClasses = result.data['classes'];
    if (rawClasses is! List) throw StateError('استجابة الحصص الافتراضية غير صالحة.');
    return rawClasses.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
  }
}
