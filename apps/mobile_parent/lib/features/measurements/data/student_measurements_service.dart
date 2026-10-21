import 'package:cloud_functions/cloud_functions.dart';

import '../models/student_measurement_item.dart';

class StudentMeasurementsService {
  StudentMeasurementsService({FirebaseFunctions? functions})
      : _functions = functions ??
            FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseFunctions _functions;

  Future<List<StudentMeasurementItem>> loadStudentMeasurements({
    required String studentId,
  }) async {
    final result = await _functions
        .httpsCallable('getMyGuardianMeasurements')
        .call<Map<String, dynamic>>({'studentId': studentId});

    final rawMeasurements = result.data['measurements'];
    if (rawMeasurements is! List) {
      throw StateError('استجابة القياسات غير صالحة.');
    }

    return rawMeasurements
        .whereType<Map>()
        .map((item) => StudentMeasurementItem.fromMap(
              Map<String, dynamic>.from(item),
            ))
        .toList();
  }
}
