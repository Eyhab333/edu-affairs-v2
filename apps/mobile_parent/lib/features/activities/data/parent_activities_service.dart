import 'package:cloud_firestore/cloud_firestore.dart';

import '../../guardian/models/parent_student_summary.dart';
import 'parent_school_activity.dart';

class ParentActivitiesService {
  ParentActivitiesService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  Future<List<ParentSchoolActivity>> loadOpenActivitiesForStudent({
    required ParentStudentSummary student,
  }) async {
    if (student.orgId.isEmpty || student.schoolId.isEmpty) {
      return [];
    }

    final snap = await _firestore
        .collection('orgs/${student.orgId}/schoolActivities')
        .where('schoolId', isEqualTo: student.schoolId)
        .get();

    final now = DateTime.now().millisecondsSinceEpoch;

    final activities = snap.docs
        .map(ParentSchoolActivity.fromDoc)
        .where((activity) => activity.orgId == student.orgId)
        .where((activity) => activity.schoolId == student.schoolId)
        .where((activity) => activity.academicYearId == student.academicYearId)
        .where((activity) => activity.status == 'REGISTRATION_OPEN')
        .where((activity) => _isRegistrationOpen(activity, now))
        .where((activity) => _isStudentTargeted(activity, student))
        .toList();

    activities.sort((a, b) {
      final aStart = a.startsAt ?? 0;
      final bStart = b.startsAt ?? 0;
      return aStart.compareTo(bStart);
    });

    return activities;
  }

  bool _isRegistrationOpen(ParentSchoolActivity activity, int now) {
    final opensAt = activity.registrationOpensAt;
    final closesAt = activity.registrationClosesAt;

    if (opensAt != null && opensAt > now) return false;
    if (closesAt != null && closesAt < now) return false;

    return true;
  }

  bool _isStudentTargeted(
    ParentSchoolActivity activity,
    ParentStudentSummary student,
  ) {
    final audience = activity.targetAudience;

    final schoolIds = _readStringList(audience, 'schoolIds');
    final gradeIds = _readStringList(audience, 'gradeIds');
    final classIds = _readStringList(audience, 'classIds');
    final studentIds = _readStringList(audience, 'studentIds');

    if (schoolIds.isNotEmpty && !schoolIds.contains(student.schoolId)) {
      return false;
    }

    if (studentIds.isNotEmpty && !studentIds.contains(student.studentId)) {
      return false;
    }

    if (gradeIds.isNotEmpty && !gradeIds.contains(student.gradeId)) {
      return false;
    }

    if (classIds.isNotEmpty && !classIds.contains(student.classId)) {
      return false;
    }

    return true;
  }

  List<String> _readStringList(Map<String, dynamic> data, String key) {
    final value = data[key];

    if (value is List) {
      return value
          .whereType<String>()
          .map((item) => item.trim())
          .where((item) => item.isNotEmpty)
          .toList();
    }

    return [];
  }
}