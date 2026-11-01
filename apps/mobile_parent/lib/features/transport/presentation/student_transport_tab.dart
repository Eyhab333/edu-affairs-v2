import 'package:flutter/material.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../../../shared/widgets/app_section_title.dart';
import '../data/parent_transport_service.dart';
import '../models/parent_transport_page.dart';

class StudentTransportTab extends StatefulWidget {
  const StudentTransportTab({
    super.key,
    required this.studentId,
    this.initialServiceDate,
  });

  final String studentId;
  final String? initialServiceDate;

  @override
  State<StudentTransportTab> createState() => _StudentTransportTabState();
}

class _StudentTransportTabState extends State<StudentTransportTab> {
  final _service = ParentTransportService();
  late Future<void> _initialFuture;

  ParentTransportEnrollment? _enrollment;
  List<ParentTransportDay> _days = const [];
  bool _hasMore = false;
  String? _nextBeforeDate;
  bool _loadingMore = false;
  Object? _loadMoreError;

  @override
  void initState() {
    super.initState();
    _initialFuture = _loadInitial();
  }

  Future<void> _loadInitial() async {
    final page = await _service.loadStudentTransport(
      studentId: widget.studentId,
      anchorDate: widget.initialServiceDate,
    );
    if (!mounted) return;

    _enrollment = page.enrollment;
    _days = page.days;
    _hasMore = page.hasMore;
    _nextBeforeDate = page.nextBeforeDate;
    _loadMoreError = null;
  }

  Future<void> _refresh() async {
    setState(() {
      _initialFuture = _loadInitial();
    });
    await _initialFuture;
  }

  Future<void> _loadMore() async {
    final beforeDate = _nextBeforeDate;
    if (_loadingMore || !_hasMore || beforeDate == null) return;

    setState(() {
      _loadingMore = true;
      _loadMoreError = null;
    });

    try {
      final page = await _service.loadStudentTransport(
        studentId: widget.studentId,
        beforeDate: beforeDate,
      );
      if (!mounted) return;

      final existingDates = _days.map((item) => item.serviceDate).toSet();
      setState(() {
        _days = [
          ..._days,
          ...page.days.where((item) => existingDates.add(item.serviceDate)),
        ];
        _hasMore = page.hasMore;
        _nextBeforeDate = page.nextBeforeDate;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loadMoreError = error;
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingMore = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _initialFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const AppLoadingState(message: 'جاري تحميل النقل المدرسي...');
        }

        if (snapshot.hasError) {
          return AppErrorState(
            title: 'تعذر تحميل النقل المدرسي',
            message: snapshot.error.toString(),
            onRetry: _refresh,
          );
        }

        final hasRecords = _days.any((day) => day.hasRecords);
        if (_enrollment == null && !hasRecords) {
          return AppEmptyState(
            icon: Icons.directions_bus_outlined,
            title: 'لا يوجد اشتراك نقل نشط',
            message: 'لا توجد أيضًا سجلات نقل معتمدة لهذا الطالب حتى الآن.',
            action: OutlinedButton.icon(
              onPressed: _refresh,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('تحديث'),
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              const AppSectionTitle(
                title: 'النقل المدرسي',
                subtitle: 'تظهر الرحلات بعد تسجيلها وإرسالها فقط.',
                icon: Icons.directions_bus_rounded,
              ),
              const SizedBox(height: AppSpacing.md),
              if (_enrollment != null) ...[
                _TransportEnrollmentCard(enrollment: _enrollment!),
                const SizedBox(height: AppSpacing.lg),
              ],
              const AppSectionTitle(
                title: 'الحضور اليومي',
                subtitle: 'آخر ثلاثة أيام تقويمية بتوقيت الرياض.',
                icon: Icons.history_rounded,
              ),
              const SizedBox(height: AppSpacing.md),
              ..._days.map(
                (day) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: _TransportDayGroup(
                    key: PageStorageKey('transport-${day.serviceDate}'),
                    day: day,
                    initiallyExpanded:
                        _days.isNotEmpty && day.serviceDate == _days.first.serviceDate,
                  ),
                ),
              ),
              if (_loadMoreError != null) ...[
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'تعذر تحميل السجل الأقدم',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        _loadMoreError.toString(),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
              ],
              if (_hasMore)
                OutlinedButton.icon(
                  onPressed: _loadingMore ? null : _loadMore,
                  icon: _loadingMore
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.expand_more_rounded),
                  label: Text(_loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _TransportEnrollmentCard extends StatelessWidget {
  const _TransportEnrollmentCard({required this.enrollment});

  final ParentTransportEnrollment enrollment;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final details = <String>[
      if (enrollment.pickupStopTitle.isNotEmpty)
        'نقطة الصعود: ${enrollment.pickupStopTitle}',
      if (enrollment.dropoffStopTitle.isNotEmpty)
        'نقطة النزول: ${enrollment.dropoffStopTitle}',
      if (enrollment.supervisorNames.isNotEmpty)
        'المشرف: ${enrollment.supervisorNames.join('، ')}',
    ];

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(AppSpacing.sm),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: const Icon(Icons.directions_bus_rounded),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  enrollment.routeTitle.isEmpty
                      ? 'خط النقل المدرسي'
                      : enrollment.routeTitle,
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (details.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xs),
                  ...details.map(
                    (detail) => Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(
                        detail,
                        style: textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TransportDayGroup extends StatelessWidget {
  const _TransportDayGroup({
    super.key,
    required this.day,
    required this.initiallyExpanded,
  });

  final ParentTransportDay day;
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        initiallyExpanded: initiallyExpanded,
        leading: const Icon(Icons.calendar_today_rounded),
        title: Text(
          _transportDateLabel(day.serviceDate),
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w900,
              ),
        ),
        subtitle: Text(
          day.hasRecords ? 'رحلات مسجلة ومعتمدة' : 'لا توجد سجلات نقل لهذا اليوم',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.lg,
            ),
            child: Column(
              children: [
                for (final tripKind in transportTripKinds)
                  _TransportTripRow(trip: day.tripFor(tripKind), tripKind: tripKind),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TransportTripRow extends StatelessWidget {
  const _TransportTripRow({required this.trip, required this.tripKind});

  final ParentTransportTrip? trip;
  final String tripKind;

  @override
  Widget build(BuildContext context) {
    final status = trip?.statusLabel ?? 'لم يسجل بعد';
    final isConfirmed = trip?.isConfirmed == true;
    final statusColor = trip == null
        ? Theme.of(context).colorScheme.onSurfaceVariant
        : trip!.isPositiveAttendance
            ? Theme.of(context).colorScheme.primary
            : AppColors.danger;
    final tripLabel = trip?.tripKindLabel ?? _tripKindLabel(tripKind);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Icon(
            isConfirmed ? Icons.check_circle_rounded : Icons.schedule_rounded,
            color: statusColor,
            size: 20,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tripLabel,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                if (trip?.stopTitle.isNotEmpty == true)
                  Text(
                    trip!.stopTitle,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
          ),
          Text(
            status,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: statusColor,
                  fontWeight: FontWeight.w900,
                ),
          ),
        ],
      ),
    );
  }
}

String _tripKindLabel(String tripKind) {
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

String _transportDateLabel(String serviceDate) {
  final parsed = DateTime.tryParse('${serviceDate}T00:00:00Z');
  if (parsed == null) return serviceDate;

  const weekdays = [
    'الاثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت',
    'الأحد',
  ];
  final day = parsed.day.toString().padLeft(2, '0');
  final month = parsed.month.toString().padLeft(2, '0');
  return '${weekdays[parsed.weekday - 1]}، $day/$month/${parsed.year}';
}

