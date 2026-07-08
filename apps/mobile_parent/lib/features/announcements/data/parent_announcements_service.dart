import 'package:cloud_firestore/cloud_firestore.dart';

import '../../guardian/data/guardian_children_service.dart';
import '../../guardian/models/parent_student_summary.dart';
import 'parent_school_activity.dart';
import 'package:cloud_functions/cloud_functions.dart';

class ParentAnnouncementsService {
  ParentAnnouncementsService({
    FirebaseFirestore? firestore,
    GuardianChildrenService? childrenService,
  }) : _firestore = firestore ?? FirebaseFirestore.instance,
       _childrenService = childrenService ?? GuardianChildrenService();

  final FirebaseFirestore _firestore;
  final GuardianChildrenService _childrenService;

  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'me-central2',
  );

  Future<List<ParentAnnouncementEntry>> loadAnnouncements() async {
    final children = await _childrenService.loadMyChildren();

    if (children.isEmpty) return [];

    final groupedChildren = <String, List<ParentStudentSummary>>{};

    for (final child in children) {
      if (child.orgId.isEmpty || child.schoolId.isEmpty) continue;

      final key = '${child.orgId}::${child.schoolId}';
      groupedChildren.putIfAbsent(key, () => []).add(child);
    }

    final entriesByActivityId = <String, ParentAnnouncementEntry>{};
    final now = DateTime.now().millisecondsSinceEpoch;

    for (final group in groupedChildren.entries) {
      final parts = group.key.split('::');
      final orgId = parts[0];
      final schoolId = parts[1];
      final studentsInSchool = group.value;

      final snap = await _firestore
          .collection('orgs/$orgId/schoolActivities')
          .where('schoolId', isEqualTo: schoolId)
          .get();

      for (final doc in snap.docs) {
        final activity = ParentSchoolActivity.fromDoc(doc);

        if (activity.orgId != orgId) continue;
        if (activity.schoolId != schoolId) continue;
        if (activity.status != 'REGISTRATION_OPEN') continue;
        if (!_isRegistrationOpen(activity, now)) continue;

        final targetedStudents = studentsInSchool
            .where((student) => _isStudentTargeted(activity, student))
            .toList();

        if (targetedStudents.isEmpty) continue;

        final existing = entriesByActivityId[activity.id];

        if (existing == null) {
          entriesByActivityId[activity.id] = ParentAnnouncementEntry(
            activity: activity,
            students: targetedStudents,
          );
        } else {
          entriesByActivityId[activity.id] = ParentAnnouncementEntry(
            activity: existing.activity,
            students: _mergeStudents(existing.students, targetedStudents),
          );
        }
      }
    }

    final entries = entriesByActivityId.values.toList();

    entries.sort((a, b) {
      final aStart = a.activity.startsAt ?? 0;
      final bStart = b.activity.startsAt ?? 0;
      return aStart.compareTo(bStart);
    });

    return entries;
  }

  Future<String> registerStudentInActivity({
    required String orgId,
    required String activityId,
    required String studentId,
    required bool guardianConsentAccepted,
  }) async {
    final callable = _functions.httpsCallable('registerStudentInActivity');

    final result = await callable.call(<String, dynamic>{
      'orgId': orgId,
      'activityId': activityId,
      'studentId': studentId,
      'guardianConsentAccepted': guardianConsentAccepted,
    });

    final data = result.data;

    if (data is Map) {
      final status = data['status'];

      if (status is String && status.isNotEmpty) {
        return status;
      }
    }

    return 'CONFIRMED';
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
    if (activity.academicYearId.isNotEmpty &&
        student.academicYearId.isNotEmpty &&
        activity.academicYearId != student.academicYearId) {
      return false;
    }

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

  List<ParentStudentSummary> _mergeStudents(
    List<ParentStudentSummary> first,
    List<ParentStudentSummary> second,
  ) {
    final byId = <String, ParentStudentSummary>{};

    for (final student in first) {
      byId[student.studentId] = student;
    }

    for (final student in second) {
      byId[student.studentId] = student;
    }

    return byId.values.toList()
      ..sort((a, b) => a.studentName.compareTo(b.studentName));
  }
}

class ParentAnnouncementEntry {
  const ParentAnnouncementEntry({
    required this.activity,
    required this.students,
  });

  final ParentSchoolActivity activity;
  final List<ParentStudentSummary> students;
}
