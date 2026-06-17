import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'parent_message_thread.dart';
import 'parent_thread_message.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../guardian/models/parent_student_summary.dart';
import 'student_communication_target.dart';

class ParentMessagesService {
  ParentMessagesService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    this.orgId = 'takween',
  }) : _auth = auth ?? FirebaseAuth.instance,
       _firestore = firestore ?? FirebaseFirestore.instance,
       _functions =
           functions ?? FirebaseFunctions.instanceFor(region: 'me-central2');

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  final String orgId;

  Future<void> sendMessage({
    required String threadId,
    required String body,
  }) async {
    final user = _auth.currentUser;
    final text = body.trim();

    if (user == null) {
      throw StateError('يجب تسجيل الدخول لإرسال الرسالة');
    }

    if (threadId.trim().isEmpty) {
      throw ArgumentError('threadId مطلوب');
    }

    if (text.isEmpty) {
      throw ArgumentError('اكتب رسالة قبل الإرسال');
    }

    final callable = _functions.httpsCallable('sendThreadMessage');

    await callable.call<Map<String, dynamic>>({
      'orgId': orgId,
      'threadId': threadId.trim(),
      'body': text,
    });
  }

  Future<void> markThreadRead({required String threadId}) async {
    final user = _auth.currentUser;
    final id = threadId.trim();

    if (user == null) {
      throw StateError('يجب تسجيل الدخول لتعليم المحادثة كمقروءة');
    }

    if (id.isEmpty) {
      throw ArgumentError('threadId مطلوب');
    }

    final callable = _functions.httpsCallable('markThreadRead');

    await callable.call<Map<String, dynamic>>({'orgId': orgId, 'threadId': id});
  }

  Future<List<StudentCommunicationTarget>> getStudentCommunicationTargets({
    required ParentStudentSummary student,
  }) async {
    final user = _auth.currentUser;

    if (user == null) {
      throw StateError('يجب تسجيل الدخول لعرض جهات التواصل');
    }

    if (student.studentId.trim().isEmpty) {
      throw ArgumentError('studentId مطلوب');
    }

    final callable = _functions.httpsCallable('getStudentCommunicationTargets');

    final result = await callable.call<Map<String, dynamic>>({
      'orgId': student.orgId.isEmpty ? orgId : student.orgId,
      'studentId': student.studentId,
      'schoolId': student.schoolId,
      'academicYearId': student.academicYearId,
    });

    final data = result.data;
    final rawTargets = data['targets'];

    if (rawTargets is! List) {
      return const [];
    }

    return rawTargets
        .whereType<Map>()
        .map((item) {
          return StudentCommunicationTarget.fromMap(
            item.cast<String, dynamic>(),
          );
        })
        .where((target) => target.targetUid.isNotEmpty)
        .toList();
  }

  Stream<List<ParentMessageThread>> watchThreads() {
    final user = _auth.currentUser;

    if (user == null) {
      return Stream.value(const []);
    }

    return _firestore
        .collection('orgs/$orgId/threads')
        .where('participantUids', arrayContains: user.uid)
        .snapshots()
        .map((snapshot) {
          final threads = snapshot.docs
              .map((doc) {
                return ParentMessageThread.fromDoc(
                  doc: doc,
                  currentUid: user.uid,
                );
              })
              .where((thread) {
                return thread.status != 'ARCHIVED';
              })
              .toList();

          threads.sort((a, b) {
            final aTime = a.lastMessageAt == 0
                ? (a.updatedAt == 0 ? a.createdAt : a.updatedAt)
                : a.lastMessageAt;

            final bTime = b.lastMessageAt == 0
                ? (b.updatedAt == 0 ? b.createdAt : b.updatedAt)
                : b.lastMessageAt;

            return bTime.compareTo(aTime);
          });

          return threads;
        });
  }

  Stream<List<ParentMessageThread>> watchStudentThreads(String studentId) {
    final id = studentId.trim();

    if (id.isEmpty) {
      return Stream.value(const []);
    }

    return watchThreads().map((threads) {
      return threads.where((thread) => thread.studentId == id).toList();
    });
  }

  Stream<int> watchUnreadCount() {
    return watchThreads().map((threads) {
      return threads.fold<int>(
        0,
        (total, thread) => total + thread.unreadCount,
      );
    });
  }

  Stream<ParentMessageThread?> watchThread(String threadId) {
    final user = _auth.currentUser;

    if (user == null || threadId.trim().isEmpty) {
      return Stream.value(null);
    }

    return _firestore.doc('orgs/$orgId/threads/$threadId').snapshots().map((
      snapshot,
    ) {
      if (!snapshot.exists) {
        return null;
      }

      final thread = ParentMessageThread.fromSnapshot(
        doc: snapshot,
        currentUid: user.uid,
      );

      if (!thread.participantUids.contains(user.uid)) {
        return null;
      }

      return thread;
    });
  }

  Stream<List<ParentThreadMessage>> watchMessages(String threadId) {
    final user = _auth.currentUser;

    if (user == null || threadId.trim().isEmpty) {
      return Stream.value(const []);
    }

    return _firestore
        .collection('orgs/$orgId/threads/$threadId/messages')
        .snapshots()
        .map((snapshot) {
          final messages = snapshot.docs
              .map(ParentThreadMessage.fromDoc)
              .where((message) => message.status != 'DELETED')
              .toList();

          messages.sort((a, b) {
            final aTime = a.createdAt == 0 ? a.updatedAt : a.createdAt;
            final bTime = b.createdAt == 0 ? b.updatedAt : b.createdAt;

            return aTime.compareTo(bTime);
          });

          return messages;
        });
  }

  Future<String> createOrGetStudentContextThread({
    required ParentStudentSummary student,
    StudentCommunicationTarget? target,
  }) async {
    if (_auth.currentUser == null) {
      throw StateError('يجب تسجيل الدخول لفتح المحادثة');
    }

    if (student.studentId.trim().isEmpty) {
      throw ArgumentError('studentId مطلوب');
    }

    if (student.schoolId.trim().isEmpty) {
      throw ArgumentError('schoolId مطلوب');
    }

    if (student.academicYearId.trim().isEmpty) {
      throw ArgumentError('academicYearId مطلوب');
    }

    final callable = _functions.httpsCallable(
      'createOrGetStudentContextThread',
    );

    final targetData = target == null
        ? {
            'targetUid': 'oyVunHzwNwdYV5HMyJKsUwaeCfW2',
            'targetPersonId': 'oyVunHzwNwdYV5HMyJKsUwaeCfW2',
            'targetRoleKey': 'platform_owner',
            'targetDisplayName': 'إدارة المدرسة',
          }
        : {
            'targetUid': target.targetUid,
            'targetPersonId': target.targetPersonId,
            'targetRoleKey': target.targetRoleKey,
            'targetDisplayName': target.targetDisplayName,
            'subjectKey': target.subjectKey,
            'classSubjectOfferingId': target.classSubjectOfferingId,
          };

    final result = await callable.call<Map<String, dynamic>>({
      'orgId': student.orgId.isEmpty ? orgId : student.orgId,

      'schoolId': student.schoolId,
      'academicYearId': student.academicYearId,
      'gradeId': student.gradeId,
      'classId': student.classId,

      'studentId': student.studentId,

      ...targetData,
    });

    final data = result.data;
    final threadId = data['threadId'];

    if (threadId is String && threadId.trim().isNotEmpty) {
      return threadId.trim();
    }

    throw StateError('لم يتم إنشاء المحادثة');
  }
}
