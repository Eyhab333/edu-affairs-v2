import 'package:flutter/material.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../../../shared/widgets/app_section_title.dart';
import '../data/student_attendance_service.dart';
import '../models/student_attendance_summary.dart';

class StudentAttendanceTab extends StatefulWidget {
  const StudentAttendanceTab({
    super.key,
    required this.studentId,
  });

  final String studentId;

  @override
  State<StudentAttendanceTab> createState() => _StudentAttendanceTabState();
}

class _StudentAttendanceTabState extends State<StudentAttendanceTab> {
  late Future<StudentAttendanceSummary> _future;

  final _service = StudentAttendanceService();

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<StudentAttendanceSummary> _load() {
    return _service.loadStudentAttendance(studentId: widget.studentId);
  }

  void _reload() {
    setState(() {
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<StudentAttendanceSummary>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const AppLoadingState(message: 'جاري تحميل سجل الحضور...');
        }

        if (snapshot.hasError) {
          return AppErrorState(
            title: 'تعذر تحميل الحضور',
            message: snapshot.error.toString(),
            onRetry: _reload,
          );
        }

        final summary = snapshot.data;

        if (summary == null || summary.isEmpty) {
          return AppEmptyState(
            icon: Icons.event_busy_rounded,
            title: 'لا يوجد سجل حضور',
            message: 'لم يتم تسجيل حضور لهذا الطالب حتى الآن.',
            action: OutlinedButton.icon(
              onPressed: _reload,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('تحديث'),
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              _LatestAttendanceCard(summary: summary),
              const SizedBox(height: AppSpacing.md),
              _CountersGrid(summary: summary),
              const SizedBox(height: AppSpacing.lg),
              const AppSectionTitle(
                title: 'آخر سجلات الحضور',
                subtitle: 'يعرض هذا التبويب سجل حضور الطالب من أحدث يوم إلى الأقدم.',
                icon: Icons.history_rounded,
              ),
              const SizedBox(height: AppSpacing.md),
              ...summary.items.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: _AttendanceItemCard(item: item),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _LatestAttendanceCard extends StatelessWidget {
  const _LatestAttendanceCard({
    required this.summary,
  });

  final StudentAttendanceSummary summary;

  @override
  Widget build(BuildContext context) {
    final latest = summary.latestItem;
    final textTheme = Theme.of(context).textTheme;

    if (latest == null) {
      return const SizedBox.shrink();
    }

    return AppCard(
      child: Row(
        children: [
          _StatusIcon(status: latest.status),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'آخر حالة حضور',
                  style: textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  latest.statusLabel,
                  style: textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  latest.dateLabel,
                  style: textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 8,
            ),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Text(
              '${summary.totalCount} سجل',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CountersGrid extends StatelessWidget {
  const _CountersGrid({
    required this.summary,
  });

  final StudentAttendanceSummary summary;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: AppSpacing.md,
      crossAxisSpacing: AppSpacing.md,
      childAspectRatio: 1.85,
      children: [
        _CounterCard(
          label: 'حضور',
          value: summary.presentCount,
          icon: Icons.check_circle_rounded,
        ),
        _CounterCard(
          label: 'غياب',
          value: summary.absentCount,
          icon: Icons.cancel_rounded,
        ),
        _CounterCard(
          label: 'تأخر',
          value: summary.lateCount,
          icon: Icons.schedule_rounded,
        ),
        _CounterCard(
          label: 'أعذار',
          value: summary.excusedCount,
          icon: Icons.verified_rounded,
        ),
        _CounterCard(
          label: 'انصراف مبكر',
          value: summary.leftEarlyCount,
          icon: Icons.logout_rounded,
        ),
        _CounterCard(
          label: 'الإجمالي',
          value: summary.totalCount,
          icon: Icons.event_note_rounded,
        ),
      ],
    );
  }
}

class _CounterCard extends StatelessWidget {
  const _CounterCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final int value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Icon(
              icon,
              color: colorScheme.primary,
              size: 23,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$value',
                  style: textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AttendanceItemCard extends StatelessWidget {
  const _AttendanceItemCard({
    required this.item,
  });

  final StudentAttendanceItem item;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StatusIcon(status: item.status),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.statusLabel,
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  item.dateLabel,
                  style: textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  item.extraLine,
                  style: textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusIcon extends StatelessWidget {
  const _StatusIcon({
    required this.status,
  });

  final String status;

  @override
  Widget build(BuildContext context) {
    final info = _statusInfo(status);

    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: info.color.withValues(alpha: 0.11),
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Icon(
        info.icon,
        color: info.color,
        size: 27,
      ),
    );
  }

  _StatusInfo _statusInfo(String status) {
    switch (status) {
      case 'PRESENT':
      case 'REMOTE_PRESENT':
        return const _StatusInfo(
          icon: Icons.check_circle_rounded,
          color: Color(0xFF15803D),
        );

      case 'ABSENT':
      case 'REMOTE_ABSENT':
        return const _StatusInfo(
          icon: Icons.cancel_rounded,
          color: Color(0xFFDC2626),
        );

      case 'LATE':
        return const _StatusInfo(
          icon: Icons.schedule_rounded,
          color: Color(0xFFD97706),
        );

      case 'EXCUSED_ABSENT':
      case 'EXCUSED_LATE':
        return const _StatusInfo(
          icon: Icons.verified_rounded,
          color: Color(0xFF2563EB),
        );

      case 'LEFT_EARLY':
        return const _StatusInfo(
          icon: Icons.logout_rounded,
          color: Color(0xFF7C3AED),
        );

      default:
        return const _StatusInfo(
          icon: Icons.help_outline_rounded,
          color: Color(0xFF64748B),
        );
    }
  }
}

class _StatusInfo {
  const _StatusInfo({
    required this.icon,
    required this.color,
  });

  final IconData icon;
  final Color color;
}