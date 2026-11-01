import 'package:cloud_functions/cloud_functions.dart';

import '../models/parent_transport_page.dart';

class ParentTransportService {
  ParentTransportService({FirebaseFunctions? functions})
      : _functions = functions ??
            FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseFunctions _functions;

  Future<ParentTransportPage> loadStudentTransport({
    required String studentId,
    String? beforeDate,
    String? anchorDate,
  }) async {
    final payload = <String, dynamic>{'studentId': studentId};
    if (beforeDate != null && beforeDate.isNotEmpty) {
      payload['beforeDate'] = beforeDate;
    }
    if (anchorDate != null && anchorDate.isNotEmpty) {
      payload['anchorDate'] = anchorDate;
    }

    final result = await _functions
        .httpsCallable('getMyGuardianTransport')
        .call<Map<String, dynamic>>(payload);

    return ParentTransportPage.fromMap(result.data);
  }
}
