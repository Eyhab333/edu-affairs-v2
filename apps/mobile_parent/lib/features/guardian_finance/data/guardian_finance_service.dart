import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../models/guardian_finance_overview.dart';

class GuardianFinanceService {
  GuardianFinanceService({
    FirebaseAuth? auth,
    FirebaseFunctions? functions,
    this.orgId = 'takween',
  }) : _auth = auth ?? FirebaseAuth.instance,
       _functions =
           functions ??
           FirebaseFunctions.instanceFor(
             region: 'me-central2',
           );

  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;
  final String orgId;

  Future<GuardianFinanceOverview> loadMyOverview() async {
    final user = _auth.currentUser;

    if (user == null) {
      throw StateError(
        'يجب تسجيل الدخول لعرض الرسوم والمدفوعات',
      );
    }

    final callable = _functions.httpsCallable(
      'getMyGuardianFinanceOverview',
    );

    final result =
        await callable.call<Map<String, dynamic>>(
      <String, dynamic>{
        'orgId': orgId,
      },
    );

    final data = Map<String, dynamic>.from(
      result.data,
    );

    if (data['ok'] != true) {
      throw StateError(
        'تعذر تحميل الملف المالي لولي الأمر',
      );
    }

    return GuardianFinanceOverview.fromMap(data);
  }
}