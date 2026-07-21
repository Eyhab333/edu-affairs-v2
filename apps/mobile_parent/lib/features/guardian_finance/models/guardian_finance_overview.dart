class GuardianFinanceOverview {
  const GuardianFinanceOverview({
    required this.guardian,
    required this.summary,
    required this.children,
    required this.payments,
    required this.receipts,
    required this.generatedAt,
  });

  final GuardianFinanceGuardian guardian;
  final GuardianFinanceSummary summary;
  final List<GuardianFinanceChild> children;
  final List<GuardianFinancePayment> payments;
  final List<GuardianFinanceReceipt> receipts;
  final int generatedAt;

  factory GuardianFinanceOverview.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceOverview(
      guardian: GuardianFinanceGuardian.fromMap(
        _map(map['guardian']),
      ),
      summary: GuardianFinanceSummary.fromMap(
        _map(map['summary']),
      ),
      children: _list(map['children'])
          .map(GuardianFinanceChild.fromMap)
          .toList(),
      payments: _list(map['payments'])
          .map(GuardianFinancePayment.fromMap)
          .toList(),
      receipts: _list(map['receipts'])
          .map(GuardianFinanceReceipt.fromMap)
          .toList(),
      generatedAt: _int(map['generatedAt']),
    );
  }
}

class GuardianFinanceGuardian {
  const GuardianFinanceGuardian({
    required this.id,
    required this.personId,
    required this.displayName,
  });

  final String id;
  final String personId;
  final String displayName;

  factory GuardianFinanceGuardian.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceGuardian(
      id: _string(map['id']),
      personId: _string(map['personId']),
      displayName: _string(
        map['displayName'],
        fallback: 'ولي الأمر',
      ),
    );
  }
}

class GuardianFinanceSummary {
  const GuardianFinanceSummary({
    required this.currency,
    required this.totalAmountMinor,
    required this.paidAmountMinor,
    required this.balanceAmountMinor,
    required this.overdueAmountMinor,
    required this.chargeCount,
  });

  final String currency;
  final int totalAmountMinor;
  final int paidAmountMinor;
  final int balanceAmountMinor;
  final int overdueAmountMinor;
  final int chargeCount;

  factory GuardianFinanceSummary.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceSummary(
      currency: _string(
        map['currency'],
        fallback: 'SAR',
      ),
      totalAmountMinor: _int(
        map['totalAmountMinor'],
      ),
      paidAmountMinor: _int(
        map['paidAmountMinor'],
      ),
      balanceAmountMinor: _int(
        map['balanceAmountMinor'],
      ),
      overdueAmountMinor: _int(
        map['overdueAmountMinor'],
      ),
      chargeCount: _int(map['chargeCount']),
    );
  }
}

class GuardianFinanceChild {
  const GuardianFinanceChild({
    required this.student,
    required this.enrollment,
    required this.summary,
    required this.charges,
    required this.installments,
  });

  final GuardianFinanceStudent student;
  final GuardianFinanceEnrollment? enrollment;
  final GuardianFinanceSummary summary;
  final List<GuardianFinanceCharge> charges;
  final List<GuardianFinanceInstallment> installments;

  factory GuardianFinanceChild.fromMap(
    Map<String, dynamic> map,
  ) {
    final enrollmentMap = _nullableMap(
      map['enrollment'],
    );

    return GuardianFinanceChild(
      student: GuardianFinanceStudent.fromMap(
        _map(map['student']),
      ),
      enrollment: enrollmentMap == null
          ? null
          : GuardianFinanceEnrollment.fromMap(
              enrollmentMap,
            ),
      summary: GuardianFinanceSummary.fromMap(
        _map(map['summary']),
      ),
      charges: _list(map['charges'])
          .map(GuardianFinanceCharge.fromMap)
          .toList(),
      installments: _list(map['installments'])
          .map(GuardianFinanceInstallment.fromMap)
          .toList(),
    );
  }
}

class GuardianFinanceStudent {
  const GuardianFinanceStudent({
    required this.id,
    required this.personId,
    required this.displayName,
    required this.relationType,
  });

  final String id;
  final String personId;
  final String displayName;
  final String relationType;

  factory GuardianFinanceStudent.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceStudent(
      id: _string(map['id']),
      personId: _string(map['personId']),
      displayName: _string(
        map['displayName'],
        fallback: 'الطالب',
      ),
      relationType: _string(
        map['relationType'],
        fallback: 'OTHER',
      ),
    );
  }
}

class GuardianFinanceEnrollment {
  const GuardianFinanceEnrollment({
    required this.id,
    required this.schoolId,
    required this.academicYearId,
    required this.gradeId,
    required this.classId,
    required this.streamId,
    required this.status,
  });

  final String id;
  final String schoolId;
  final String academicYearId;
  final String gradeId;
  final String classId;
  final String streamId;
  final String status;

  factory GuardianFinanceEnrollment.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceEnrollment(
      id: _string(map['id']),
      schoolId: _string(map['schoolId']),
      academicYearId: _string(
        map['academicYearId'],
      ),
      gradeId: _string(map['gradeId']),
      classId: _string(map['classId']),
      streamId: _string(map['streamId']),
      status: _string(map['status']),
    );
  }
}

class GuardianFinanceCharge {
  const GuardianFinanceCharge({
    required this.id,
    required this.studentId,
    required this.studentDisplayName,
    required this.title,
    required this.description,
    required this.category,
    required this.currency,
    required this.netAmountMinor,
    required this.paidAmountMinor,
    required this.balanceAmountMinor,
    required this.status,
    this.dueAt,
  });

  final String id;
  final String studentId;
  final String studentDisplayName;
  final String title;
  final String description;
  final String category;
  final String currency;
  final int netAmountMinor;
  final int paidAmountMinor;
  final int balanceAmountMinor;
  final String status;
  final int? dueAt;

  factory GuardianFinanceCharge.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceCharge(
      id: _string(map['id']),
      studentId: _string(map['studentId']),
      studentDisplayName: _string(
        map['studentDisplayName'],
      ),
      title: _string(
        map['title'],
        fallback: 'مستحق مالي',
      ),
      description: _string(map['description']),
      category: _string(
        map['category'],
        fallback: 'OTHER',
      ),
      currency: _string(
        map['currency'],
        fallback: 'SAR',
      ),
      netAmountMinor: _int(
        map['netAmountMinor'],
      ),
      paidAmountMinor: _int(
        map['paidAmountMinor'],
      ),
      balanceAmountMinor: _int(
        map['balanceAmountMinor'],
      ),
      status: _string(map['status']),
      dueAt: _nullableInt(map['dueAt']),
    );
  }
}

class GuardianFinanceInstallment {
  const GuardianFinanceInstallment({
    required this.id,
    required this.chargeId,
    required this.studentId,
    required this.sequence,
    required this.title,
    required this.currency,
    required this.amountMinor,
    required this.paidAmountMinor,
    required this.balanceAmountMinor,
    required this.status,
    this.dueAt,
  });

  final String id;
  final String chargeId;
  final String studentId;
  final int sequence;
  final String title;
  final String currency;
  final int amountMinor;
  final int paidAmountMinor;
  final int balanceAmountMinor;
  final String status;
  final int? dueAt;

  factory GuardianFinanceInstallment.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceInstallment(
      id: _string(map['id']),
      chargeId: _string(map['chargeId']),
      studentId: _string(map['studentId']),
      sequence: _int(map['sequence']),
      title: _string(map['title']),
      currency: _string(
        map['currency'],
        fallback: 'SAR',
      ),
      amountMinor: _int(map['amountMinor']),
      paidAmountMinor: _int(
        map['paidAmountMinor'],
      ),
      balanceAmountMinor: _int(
        map['balanceAmountMinor'],
      ),
      status: _string(map['status']),
      dueAt: _nullableInt(map['dueAt']),
    );
  }
}

class GuardianFinancePayment {
  const GuardianFinancePayment({
    required this.id,
    required this.receiptNumber,
    required this.currency,
    required this.amountMinor,
    required this.paymentMethod,
    required this.status,
    required this.allocations,
    this.paidAt,
    this.postedAt,
    this.reversedAt,
    required this.reversalReason,
  });

  final String id;
  final String receiptNumber;
  final String currency;
  final int amountMinor;
  final String paymentMethod;
  final String status;
  final List<GuardianFinanceAllocation> allocations;
  final int? paidAt;
  final int? postedAt;
  final int? reversedAt;
  final String reversalReason;

  factory GuardianFinancePayment.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinancePayment(
      id: _string(map['id']),
      receiptNumber: _string(
        map['receiptNumber'],
      ),
      currency: _string(
        map['currency'],
        fallback: 'SAR',
      ),
      amountMinor: _int(map['amountMinor']),
      paymentMethod: _string(
        map['paymentMethod'],
      ),
      status: _string(map['status']),
      allocations: _list(map['allocations'])
          .map(GuardianFinanceAllocation.fromMap)
          .toList(),
      paidAt: _nullableInt(map['paidAt']),
      postedAt: _nullableInt(map['postedAt']),
      reversedAt: _nullableInt(map['reversedAt']),
      reversalReason: _string(
        map['reversalReason'],
      ),
    );
  }
}

class GuardianFinanceAllocation {
  const GuardianFinanceAllocation({
    required this.studentId,
    required this.chargeId,
    required this.installmentId,
    required this.amountMinor,
  });

  final String studentId;
  final String chargeId;
  final String installmentId;
  final int amountMinor;

  factory GuardianFinanceAllocation.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceAllocation(
      studentId: _string(map['studentId']),
      chargeId: _string(map['chargeId']),
      installmentId: _string(
        map['installmentId'],
      ),
      amountMinor: _int(map['amountMinor']),
    );
  }
}

class GuardianFinanceReceipt {
  const GuardianFinanceReceipt({
    required this.id,
    required this.paymentId,
    required this.receiptNumber,
    required this.status,
    required this.currency,
    required this.amountMinor,
    this.issuedAt,
    this.cancelledAt,
    required this.cancelReason,
  });

  final String id;
  final String paymentId;
  final String receiptNumber;
  final String status;
  final String currency;
  final int amountMinor;
  final int? issuedAt;
  final int? cancelledAt;
  final String cancelReason;

  factory GuardianFinanceReceipt.fromMap(
    Map<String, dynamic> map,
  ) {
    return GuardianFinanceReceipt(
      id: _string(map['id']),
      paymentId: _string(map['paymentId']),
      receiptNumber: _string(
        map['receiptNumber'],
      ),
      status: _string(map['status']),
      currency: _string(
        map['currency'],
        fallback: 'SAR',
      ),
      amountMinor: _int(map['amountMinor']),
      issuedAt: _nullableInt(map['issuedAt']),
      cancelledAt: _nullableInt(
        map['cancelledAt'],
      ),
      cancelReason: _string(
        map['cancelReason'],
      ),
    );
  }
}

Map<String, dynamic> _map(dynamic value) {
  if (value is Map<String, dynamic>) {
    return value;
  }

  if (value is Map) {
    return Map<String, dynamic>.from(value);
  }

  return <String, dynamic>{};
}

Map<String, dynamic>? _nullableMap(dynamic value) {
  if (value == null) return null;
  return _map(value);
}

List<Map<String, dynamic>> _list(dynamic value) {
  if (value is! List) {
    return const [];
  }

  return value.map(_map).toList();
}

String _string(
  dynamic value, {
  String fallback = '',
}) {
  if (value is String && value.trim().isNotEmpty) {
    return value.trim();
  }

  return fallback;
}

int _int(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();

  return 0;
}

int? _nullableInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();

  return null;
}