import 'package:cloud_functions/cloud_functions.dart';

import '../models/guardian_learning_loss_plan.dart';

class GuardianLearningLossService {
  GuardianLearningLossService({FirebaseFunctions? functions})
      : _functions = functions ??
            FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseFunctions _functions;

  Future<List<GuardianLearningLossPlan>> loadStudentLearningLoss({
    required String studentId,
  }) async {
    final result = await _functions
        .httpsCallable('getMyGuardianLearningLoss')
        .call<Map<String, dynamic>>({'studentId': studentId});
    final rawPlans = result.data['plans'];
    if (rawPlans is! List) {
      throw StateError('استجابة الفاقد التعليمي غير صالحة.');
    }

    return rawPlans
        .whereType<Map>()
        .map((item) => GuardianLearningLossPlan.fromMap(
              Map<String, dynamic>.from(item),
            ))
        .toList();
  }
}
