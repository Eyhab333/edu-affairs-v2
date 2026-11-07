import 'package:cloud_functions/cloud_functions.dart';

import '../../../shared/data/guardian_read_cache.dart';
import '../../../shared/data/retry_transient_callable.dart';
import '../models/student_measurement_item.dart';

class StudentMeasurementsService {
  StudentMeasurementsService({FirebaseFunctions? functions})
      : _functions = functions ??
            FirebaseFunctions.instanceFor(region: 'me-central2'),
        _cache = functions == null ? _sharedCache : null;

  static final _sharedCache = GuardianReadCache<List<StudentMeasurementItem>>();
  static void clearCache() => _sharedCache.clear();
  final FirebaseFunctions _functions;
  final GuardianReadCache<List<StudentMeasurementItem>>? _cache;

  Future<List<StudentMeasurementItem>> loadStudentMeasurements({
    required String studentId,
    bool forceRefresh = false,
  }) {
    Future<List<StudentMeasurementItem>> fetch() => _fetch(studentId);
    return _cache?.load(
          studentId: studentId,
          operation: 'measurements',
          fetch: fetch,
          forceRefresh: forceRefresh,
        ) ?? fetch();
  }

  Future<List<StudentMeasurementItem>> _fetch(String studentId) async {
    final result = await retryTransientCallable(
      operationName: 'getMyGuardianMeasurements',
      operation: () => _functions
          .httpsCallable('getMyGuardianMeasurements')
          .call<Map<String, dynamic>>({'studentId': studentId}),
    );

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
