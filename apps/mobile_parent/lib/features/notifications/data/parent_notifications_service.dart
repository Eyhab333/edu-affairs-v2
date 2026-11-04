import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'parent_notification.dart';

class ParentNotificationsService {
  ParentNotificationsService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,

    this.orgId = 'takween',
  }) : _auth = auth ?? FirebaseAuth.instance,
       _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;

  final String orgId;

  Stream<List<ParentNotification>> watchNotifications() async* {
    final user = _auth.currentUser;

    if (user == null) {
      yield const [];
      return;
    }

    final personId = await _loadCurrentPersonId();

    final streams = <Stream<QuerySnapshot<Map<String, dynamic>>>>[
      _firestore
          .collection('orgs/$orgId/notificationLogs')
          .where('recipientUid', isEqualTo: user.uid)
          .limit(50)
          .snapshots(),
    ];

    if (personId.isNotEmpty) {
      streams.add(
        _firestore
            .collection('orgs/$orgId/notificationLogs')
            .where('recipientPersonId', isEqualTo: personId)
            .limit(50)
            .snapshots(),
      );
    }

    await for (final notifications in _mergeStreams(streams)) {
      yield notifications;
    }
  }



Stream<int> watchUnreadCount() {
  return watchNotifications().map((notifications) {
    return notifications.where((notification) => !notification.isRead).length;
  });
}


  Future<void> markAsRead(String notificationId) async {
    final now = DateTime.now().millisecondsSinceEpoch;

    await _firestore.doc('orgs/$orgId/notificationLogs/$notificationId').update(
      {'status': 'READ', 'readAt': now, 'updatedAt': now},
    );
  }

  Future<String> _loadCurrentPersonId() async {
    try {
      final user = _auth.currentUser;
      if (user == null) return '';

      final userDoc = await _firestore.doc('users/${user.uid}').get();
      final userData = userDoc.data();

      final personId = _readString(userData, 'personId');
      if (personId.isEmpty) return '';

      return personId;
    } catch (_) {
      return '';
    }
  }

  String _readString(
    Map<String, dynamic>? data,
    String key, {
    String fallback = '',
  }) {
    final value = data?[key];

    if (value is String && value.trim().isNotEmpty) {
      return value.trim();
    }

    return fallback;
  }

  Stream<List<ParentNotification>> _mergeStreams(
    List<Stream<QuerySnapshot<Map<String, dynamic>>>> streams,
  ) async* {
    final latestByIndex =
        <int, List<QueryDocumentSnapshot<Map<String, dynamic>>>>{};

    final controller =
        StreamControllerAdapter<
          MapEntry<int, QuerySnapshot<Map<String, dynamic>>>
        >();

    for (var index = 0; index < streams.length; index++) {
      streams[index].listen((snapshot) {
        controller.add(MapEntry(index, snapshot));
      });
    }

    await for (final entry in controller.stream) {
      latestByIndex[entry.key] = entry.value.docs;

      final byId = <String, ParentNotification>{};

      for (final docs in latestByIndex.values) {
        for (final doc in docs) {
          byId[doc.id] = ParentNotification.fromMap(doc.id, doc.data());
        }
      }

      final items = byId.values.toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

      yield items;
    }
  }
}

class StreamControllerAdapter<T> {
  final _controller = StreamController<T>.broadcast();

  Stream<T> get stream => _controller.stream;

  void add(T value) {
    if (!_controller.isClosed) {
      _controller.add(value);
    }
  }
}
