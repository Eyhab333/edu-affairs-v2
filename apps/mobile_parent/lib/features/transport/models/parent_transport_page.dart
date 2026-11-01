const transportTripKinds = <String>[
  'MORNING_PICKUP',
  'MORNING_ARRIVAL',
  'AFTERNOON_BOARDING',
  'AFTERNOON_DROPOFF',
];

class ParentTransportPage {
  const ParentTransportPage({
    required this.enrollment,
    required this.days,
    required this.hasMore,
    required this.nextBeforeDate,
  });

  final ParentTransportEnrollment? enrollment;
  final List<ParentTransportDay> days;
  final bool hasMore;
  final String? nextBeforeDate;

  factory ParentTransportPage.fromMap(Map<String, dynamic> data) {
    final rawDays = data['days'];
    return ParentTransportPage(
      enrollment: data['enrollment'] is Map
          ? ParentTransportEnrollment.fromMap(
              Map<String, dynamic>.from(data['enrollment'] as Map),
            )
          : null,
      days: rawDays is List
          ? rawDays
              .whereType<Map>()
              .map((item) => ParentTransportDay.fromMap(
                    Map<String, dynamic>.from(item),
                  ))
              .toList()
          : const [],
      hasMore: data['hasMore'] == true,
      nextBeforeDate: _readString(data, 'nextBeforeDate').isEmpty
          ? null
          : _readString(data, 'nextBeforeDate'),
    );
  }
}

class ParentTransportEnrollment {
  const ParentTransportEnrollment({
    required this.id,
    required this.routeId,
    required this.routeTitle,
    required this.pickupStopTitle,
    required this.dropoffStopTitle,
    required this.supervisorNames,
  });

  final String id;
  final String routeId;
  final String routeTitle;
  final String pickupStopTitle;
  final String dropoffStopTitle;
  final List<String> supervisorNames;

  factory ParentTransportEnrollment.fromMap(Map<String, dynamic> data) {
    final rawSupervisors = data['supervisorNames'];
    return ParentTransportEnrollment(
      id: _readString(data, 'id'),
      routeId: _readString(data, 'routeId'),
      routeTitle: _readString(data, 'routeTitle'),
      pickupStopTitle: _readString(data, 'pickupStopTitle'),
      dropoffStopTitle: _readString(data, 'dropoffStopTitle'),
      supervisorNames: rawSupervisors is List
          ? rawSupervisors
              .whereType<String>()
              .map((item) => item.trim())
              .where((item) => item.isNotEmpty)
              .toList()
          : const [],
    );
  }
}

class ParentTransportDay {
  const ParentTransportDay({
    required this.serviceDate,
    required this.trips,
  });

  final String serviceDate;
  final List<ParentTransportTrip> trips;

  factory ParentTransportDay.fromMap(Map<String, dynamic> data) {
    final rawTrips = data['trips'];
    return ParentTransportDay(
      serviceDate: _readString(data, 'serviceDate'),
      trips: rawTrips is List
          ? rawTrips
              .whereType<Map>()
              .map((item) => ParentTransportTrip.fromMap(
                    Map<String, dynamic>.from(item),
                  ))
              .toList()
          : const [],
    );
  }

  ParentTransportTrip? tripFor(String tripKind) {
    for (final trip in trips) {
      if (trip.tripKind == tripKind) return trip;
    }
    return null;
  }

  bool get hasRecords => trips.isNotEmpty;
}

class ParentTransportTrip {
  const ParentTransportTrip({
    required this.id,
    required this.tripKind,
    required this.status,
    required this.stopTitle,
    required this.recordedAtMs,
  });

  final String id;
  final String tripKind;
  final String status;
  final String stopTitle;
  final int? recordedAtMs;

  factory ParentTransportTrip.fromMap(Map<String, dynamic> data) {
    final recordedAt = data['recordedAt'];
    return ParentTransportTrip(
      id: _readString(data, 'id'),
      tripKind: _readString(data, 'tripKind'),
      status: _readString(data, 'status'),
      stopTitle: _readString(data, 'stopTitle'),
      recordedAtMs: recordedAt is num ? recordedAt.toInt() : null,
    );
  }

  String get tripKindLabel {
    switch (tripKind) {
      case 'MORNING_PICKUP':
        return 'الصعود الصباحي';
      case 'MORNING_ARRIVAL':
        return 'الوصول إلى المدرسة';
      case 'AFTERNOON_BOARDING':
        return 'الصعود وقت الانصراف';
      case 'AFTERNOON_DROPOFF':
        return 'النزول عند المنزل';
      default:
        return tripKind;
    }
  }

  String get statusLabel {
    switch (status) {
      case 'BOARDED':
        return 'صعد';
      case 'NOT_BOARDED':
        return 'لم يصعد';
      case 'ARRIVED':
        return 'وصل';
      case 'DROPPED_OFF':
        return 'نزل';
      case 'ABSENT':
        return 'غائب';
      case 'EXCUSED':
        return 'بعذر';
      case 'LATE':
        return 'متأخر';
      case 'ISSUE':
        return 'مشكلة';
      default:
        return 'لم يسجل';
    }
  }

  bool get isConfirmed => status.isNotEmpty && status != 'PENDING';

  bool get isPositiveAttendance =>
      status == 'BOARDED' || status == 'ARRIVED' || status == 'DROPPED_OFF';
}

String _readString(Map<String, dynamic> data, String key) {
  final value = data[key];
  return value is String ? value.trim() : '';
}
