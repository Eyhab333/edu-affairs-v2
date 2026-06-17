import 'package:cloud_firestore/cloud_firestore.dart';

class ParentMessageParticipant {
  const ParentMessageParticipant({
    required this.uid,
    required this.personId,
    required this.kind,
    required this.roleKey,
    required this.displayName,
    required this.unreadCount,
    required this.muted,
    this.lastReadAt,
  });

  final String uid;
  final String personId;
  final String kind;
  final String roleKey;
  final String displayName;
  final int unreadCount;
  final bool muted;
  final int? lastReadAt;

  factory ParentMessageParticipant.fromMap(Map<String, dynamic> data) {
    return ParentMessageParticipant(
      uid: _readString(data, 'uid'),
      personId: _readString(data, 'personId'),
      kind: _readString(data, 'kind'),
      roleKey: _readString(data, 'roleKey'),
      displayName: _readString(data, 'displayName', fallback: 'مشارك'),
      unreadCount: _readInt(data, 'unreadCount'),
      muted: data['muted'] == true,
      lastReadAt: _readNullableMillis(data['lastReadAt']),
    );
  }
}

class ParentMessageThread {
  const ParentMessageThread({
    required this.id,
    required this.orgId,
    required this.type,
    required this.status,
    required this.isInternal,
    required this.schoolId,
    required this.academicYearId,
    required this.classId,
    required this.studentId,
    required this.participantUids,
    required this.participants,
    required this.currentParticipant,
    required this.otherParticipants,
    required this.otherDisplayName,
    required this.lastMessageSummary,
    required this.lastMessageAt,
    required this.lastMessageSenderUid,
    required this.lastMessageType,
    required this.unreadCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String orgId;

  final String type;
  final String status;
  final bool isInternal;

  final String schoolId;
  final String academicYearId;
  final String classId;
  final String studentId;

  final List<String> participantUids;
  final List<ParentMessageParticipant> participants;

  final ParentMessageParticipant? currentParticipant;
  final List<ParentMessageParticipant> otherParticipants;
  final String otherDisplayName;

  final String lastMessageSummary;
  final int lastMessageAt;
  final String lastMessageSenderUid;
  final String lastMessageType;

  final int unreadCount;

  final int createdAt;
  final int updatedAt;



factory ParentMessageThread.fromSnapshot({
  required DocumentSnapshot<Map<String, dynamic>> doc,
  required String currentUid,
}) {
  final data = doc.data();

  if (data == null) {
    throw StateError('Thread document has no data');
  }

  return ParentMessageThread._fromMap(
    id: doc.id,
    data: data,
    currentUid: currentUid,
  );
}

factory ParentMessageThread._fromMap({
  required String id,
  required Map<String, dynamic> data,
  required String currentUid,
}) {
  final participants = _readParticipants(data);
  final currentParticipant = participants
      .where((participant) => participant.uid == currentUid)
      .firstOrNull;

  final otherParticipants = participants
      .where((participant) => participant.uid != currentUid)
      .toList();

  final otherDisplayName = otherParticipants
      .map((participant) => participant.displayName)
      .where((name) => name.trim().isNotEmpty)
      .join('، ');

  return ParentMessageThread(
    id: id,
    orgId: _readString(data, 'orgId'),
    type: _readString(data, 'type', fallback: 'DIRECT'),
    status: _readString(data, 'status', fallback: 'ACTIVE'),
    isInternal: data['isInternal'] == true,
    schoolId: _readString(data, 'schoolId'),
    academicYearId: _readString(data, 'academicYearId'),
    classId: _readString(data, 'classId'),
    studentId: _readString(data, 'studentId'),
    participantUids: _readStringList(data, 'participantUids'),
    participants: participants,
    currentParticipant: currentParticipant,
    otherParticipants: otherParticipants,
    otherDisplayName: otherDisplayName.isEmpty ? 'محادثة' : otherDisplayName,
    lastMessageSummary: _readString(data, 'lastMessageSummary'),
    lastMessageAt: _readMillis(data['lastMessageAt']),
    lastMessageSenderUid: _readString(data, 'lastMessageSenderUid'),
    lastMessageType: _readString(data, 'lastMessageType', fallback: 'TEXT'),
    unreadCount: currentParticipant?.unreadCount ?? 0,
    createdAt: _readMillis(data['createdAt']),
    updatedAt: _readMillis(data['updatedAt']),
  );
}


factory ParentMessageThread.fromDoc({
  required QueryDocumentSnapshot<Map<String, dynamic>> doc,
  required String currentUid,
}) {
  return ParentMessageThread._fromMap(
    id: doc.id,
    data: doc.data(),
    currentUid: currentUid,
  );
}






}







extension FirstOrNullExtension<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;

    if (iterator.moveNext()) {
      return iterator.current;
    }

    return null;
  }
}

List<ParentMessageParticipant> _readParticipants(Map<String, dynamic> data) {
  final value = data['participants'];

  if (value is! List) {
    return const [];
  }

  return value
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .map(ParentMessageParticipant.fromMap)
      .toList();
}

List<String> _readStringList(Map<String, dynamic> data, String key) {
  final value = data[key];

  if (value is! List) {
    return const [];
  }

  return value.whereType<String>().toList();
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

int _readInt(Map<String, dynamic> data, String key) {
  final value = data[key];

  if (value is int) return value;
  if (value is num) return value.toInt();

  return 0;
}

int _readMillis(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is Timestamp) return value.millisecondsSinceEpoch;
  if (value is DateTime) return value.millisecondsSinceEpoch;

  return 0;
}

int? _readNullableMillis(dynamic value) {
  final millis = _readMillis(value);
  return millis == 0 ? null : millis;
}