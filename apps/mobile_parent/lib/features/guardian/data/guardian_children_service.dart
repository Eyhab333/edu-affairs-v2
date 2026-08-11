import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../models/parent_student_summary.dart';

class GuardianChildrenService {
  GuardianChildrenService({
    FirebaseAuth? auth,
    FirebaseFunctions? functions,
  })  : _auth = auth ?? FirebaseAuth.instance,
        _functions =
            functions ?? FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;

  Future<List<ParentStudentSummary>> loadMyChildren() async {
    final user = _auth.currentUser;

    if (user == null) {
      throw Exception('لم يتم تسجيل الدخول');
    }

    final callable = _functions.httpsCallable('getMyGuardianChildren');
    final result = await callable.call<Map<String, dynamic>>(
      const <String, dynamic>{},
    );
    final rawChildren = result.data['children'];

    if (rawChildren is! List) {
      throw StateError('استجابة الأبناء غير صالحة.');
    }

    return rawChildren
        .whereType<Map>()
        .map(
          (item) => ParentStudentSummary.fromMap(
            Map<String, dynamic>.from(item),
          ),
        )
        .where((student) => student.studentId.isNotEmpty)
        .toList();
  }
}
