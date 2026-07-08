import 'package:cloud_firestore/cloud_firestore.dart';

class ParentSchoolActivity {
  const ParentSchoolActivity({
    required this.id,
    required this.orgId,
    required this.schoolId,
    required this.academicYearId,
    required this.title,
    required this.shortDescription,
    required this.description,
    required this.activityKind,
    required this.status,
    required this.registrationOpensAt,
    required this.registrationClosesAt,
    required this.startsAt,
    required this.endsAt,
    required this.locationTitle,
    required this.capacity,
    required this.registeredCount,
    required this.confirmedCount,
    required this.waitlistedCount,
    required this.requiresGuardianConsent,
    required this.consentText,
    required this.targetAudience,
  });

  final String id;
  final String orgId;
  final String schoolId;
  final String academicYearId;

  final String title;
  final String shortDescription;
  final String description;
  final String activityKind;
  final String status;

  final int? registrationOpensAt;
  final int? registrationClosesAt;
  final int? startsAt;
  final int? endsAt;

  final String locationTitle;

  final int? capacity;
  final int registeredCount;
  final int confirmedCount;
  final int waitlistedCount;

  final bool requiresGuardianConsent;
  final String consentText;

  final Map<String, dynamic> targetAudience;

  factory ParentSchoolActivity.fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();

    return ParentSchoolActivity(
      id: doc.id,
      orgId: _readString(data, 'orgId'),
      schoolId: _readString(data, 'schoolId'),
      academicYearId: _readString(data, 'academicYearId'),
      title: _readString(data, 'title'),
      shortDescription: _readString(data, 'shortDescription'),
      description: _readString(data, 'description'),
      activityKind: _readString(data, 'activityKind'),
      status: _readString(data, 'status'),
      registrationOpensAt: _readInt(data, 'registrationOpensAt'),
      registrationClosesAt: _readInt(data, 'registrationClosesAt'),
      startsAt: _readInt(data, 'startsAt'),
      endsAt: _readInt(data, 'endsAt'),
      locationTitle: _readString(data, 'locationTitle'),
      capacity: _readInt(data, 'capacity'),
      registeredCount: _readInt(data, 'registeredCount') ?? 0,
      confirmedCount: _readInt(data, 'confirmedCount') ?? 0,
      waitlistedCount: _readInt(data, 'waitlistedCount') ?? 0,
      requiresGuardianConsent: data['requiresGuardianConsent'] == true,
      consentText: _readString(data, 'consentText'),
      targetAudience: data['targetAudience'] is Map
          ? Map<String, dynamic>.from(data['targetAudience'] as Map)
          : <String, dynamic>{},
    );
  }
}

String _readString(Map<String, dynamic> data, String key) {
  final value = data[key];

  if (value is String) return value.trim();

  return '';
}

int? _readInt(Map<String, dynamic> data, String key) {
  final value = data[key];

  if (value is int) return value;
  if (value is num) return value.toInt();

  return null;
}