import 'package:cloud_functions/cloud_functions.dart';

import '../../../shared/data/guardian_read_cache.dart';
import '../../../shared/data/retry_transient_callable.dart';

class StudentVirtualClassesService {
  StudentVirtualClassesService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'me-central2'),
        _cache = functions == null ? _sharedCache : null;

  static final _sharedCache = GuardianReadCache<List<Map<String, dynamic>>>();
  static void clearCache() => _sharedCache.clear();
  final FirebaseFunctions _functions;
  final GuardianReadCache<List<Map<String, dynamic>>>? _cache;

  Future<List<Map<String, dynamic>>> loadStudentVirtualClasses({
    required String studentId,
    bool forceRefresh = false,
  }) {
    Future<List<Map<String, dynamic>>> fetch() => _fetch(studentId);
    return _cache?.load(
          studentId: studentId,
          operation: 'virtual_classes',
          fetch: fetch,
          forceRefresh: forceRefresh,
        ) ?? fetch();
  }

  Future<List<Map<String, dynamic>>> _fetch(String studentId) async {
    final result = await retryTransientCallable(
      operationName: 'getMyGuardianVirtualClasses',
      operation: () => _functions
          .httpsCallable('getMyGuardianVirtualClasses')
          .call<Map<String, dynamic>>({'studentId': studentId}),
    );
    final rawClasses = result.data['classes'];
    if (rawClasses is! List) throw StateError('استجابة الحصص الافتراضية غير صالحة.');
    return rawClasses.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
  }
}
