import 'package:cloud_firestore/cloud_firestore.dart';

class ParentThreadMessage {
  const ParentThreadMessage({
    required this.id,
    required this.orgId,
    required this.threadId,
    required this.type,
    required this.status,
    required this.senderUid,
    required this.senderPersonId,
    required this.senderRoleKey,
    required this.senderDisplayName,
    required this.body,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String orgId;
  final String threadId;

  final String type;
  final String status;

  final String senderUid;
  final String senderPersonId;
  final String senderRoleKey;
  final String senderDisplayName;

  final String body;

  final int createdAt;
  final int updatedAt;

  factory ParentThreadMessage.fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();

    return ParentThreadMessage(
      id: doc.id,
      orgId: _readString(data, 'orgId'),
      threadId: _readString(data, 'threadId'),
      type: _readString(data, 'type', fallback: 'TEXT'),
      status: _readString(data, 'status', fallback: 'SENT'),
      senderUid: _readString(data, 'senderUid'),
      senderPersonId: _readString(data, 'senderPersonId'),
      senderRoleKey: _readString(data, 'senderRoleKey'),
      senderDisplayName: _readString(data, 'senderDisplayName', fallback: 'مشارك'),
      body: _readString(data, 'body'),
      createdAt: _readMillis(data['createdAt']),
      updatedAt: _readMillis(data['updatedAt']),
    );
  }
}

String _readString(
  Map<String, dynamic> data,
  String key, {
  String fallback = '',
}) {
  final value = data[key];

  if (value is String && value.trim().isNotEmpty) {
    return value.trim();
  }

  return fallback;
}

int _readMillis(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is Timestamp) return value.millisecondsSinceEpoch;
  if (value is DateTime) return value.millisecondsSinceEpoch;

  return 0;
}