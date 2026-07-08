import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../../guardian/data/guardian_children_service.dart';
import '../../guardian/models/parent_student_summary.dart';
import '../data/parent_activities_service.dart';
import '../data/parent_school_activity.dart';

class StudentActivitiesScreen extends StatefulWidget {
  const StudentActivitiesScreen({required this.studentId, super.key});

  final String studentId;

  @override
  State<StudentActivitiesScreen> createState() =>
      _StudentActivitiesScreenState();
}

class _StudentActivitiesScreenState extends State<StudentActivitiesScreen> {
  final _childrenService = GuardianChildrenService();
  final _activitiesService = ParentActivitiesService();

  late Future<_StudentActivitiesBundle?> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadData();
  }

  Future<_StudentActivitiesBundle?> _loadData() async {
    final children = await _childrenService.loadMyChildren();

    ParentStudentSummary? student;

    for (final child in children) {
      if (child.studentId == widget.studentId) {
        student = child;
        break;
      }
    }

    if (student == null) return null;

    final activities = await _activitiesService.loadOpenActivitiesForStudent(
      student: student,
    );

    return _StudentActivitiesBundle(student: student, activities: activities);
  }

  void _reload() {
    setState(() {
      _future = _loadData();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_StudentActivitiesBundle?>(
      future: _future,
      builder: (context, snapshot) {
        final student = snapshot.data?.student;

        return Scaffold(
          appBar: AppBar(
            title: Text(
              student == null ? 'الأنشطة' : 'الأنشطة - ${student.studentName}',
            ),
            leading: IconButton(
              onPressed: () => context.pop(),
              icon: const Icon(Icons.arrow_back_rounded),
            ),
            actions: [
              IconButton(
                tooltip: 'تحديث',
                onPressed: _reload,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          body: SafeArea(child: _buildBody(snapshot)),
        );
      },
    );
  }

  Widget _buildBody(AsyncSnapshot<_StudentActivitiesBundle?> snapshot) {
    if (snapshot.connectionState == ConnectionState.waiting) {
      return const AppLoadingState(message: 'جاري تحميل الأنشطة...');
    }

    if (snapshot.hasError) {
      return AppErrorState(
        title: 'تعذر تحميل الأنشطة',
        message: snapshot.error.toString(),
        onRetry: _reload,
      );
    }

    final bundle = snapshot.data;

    if (bundle == null) {
      return AppEmptyState(
        icon: Icons.lock_outline_rounded,
        title: 'لا يمكن فتح الأنشطة',
        message: 'هذا الطالب غير مرتبط بحساب ولي الأمر الحالي.',
        action: OutlinedButton.icon(
          onPressed: () => context.go('/children'),
          icon: const Icon(Icons.arrow_back_rounded),
          label: const Text('العودة إلى أبنائي'),
        ),
      );
    }

    if (bundle.activities.isEmpty) {
      return AppEmptyState(
        icon: Icons.event_busy_rounded,
        title: 'لا توجد أنشطة متاحة',
        message: 'لا توجد أنشطة مفتوحة للتسجيل لهذا الطالب حاليًا.',
        action: OutlinedButton.icon(
          onPressed: _reload,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('تحديث'),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.lg),
        itemCount: bundle.activities.length,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, index) {
          final activity = bundle.activities[index];

          return _ActivityCard(activity: activity);
        },
      ),
    );
  }
}

class _ActivityCard extends StatelessWidget {
  const _ActivityCard({required this.activity});

  final ParentSchoolActivity activity;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final remainingSeats = _remainingSeats(activity);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CircleAvatar(child: Icon(Icons.emoji_events_rounded)),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      activity.title.isEmpty ? 'نشاط مدرسي' : activity.title,
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _activityKindLabel(activity.activityKind),
                      style: textTheme.bodySmall?.copyWith(
                        color: AppColors.mutedText,
                      ),
                    ),
                  ],
                ),
              ),
              const _StatusChip(label: 'التسجيل مفتوح'),
            ],
          ),
          if (activity.shortDescription.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(activity.shortDescription, style: textTheme.bodyMedium),
          ],
          if (activity.description.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              activity.description,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: textTheme.bodySmall?.copyWith(color: AppColors.mutedText),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          _InfoRow(
            icon: Icons.schedule_rounded,
            label: 'بداية النشاط',
            value: _formatDateTime(activity.startsAt),
          ),
          const SizedBox(height: AppSpacing.sm),
          _InfoRow(
            icon: Icons.event_available_rounded,
            label: 'نهاية التسجيل',
            value: _formatDateTime(activity.registrationClosesAt),
          ),
          const SizedBox(height: AppSpacing.sm),
          _InfoRow(
            icon: Icons.place_rounded,
            label: 'المكان',
            value: activity.locationTitle.isEmpty
                ? 'غير محدد'
                : activity.locationTitle,
          ),
          const SizedBox(height: AppSpacing.sm),
          _InfoRow(
            icon: Icons.groups_rounded,
            label: 'المقاعد',
            value: activity.capacity == null
                ? 'غير محددة'
                : 'المتبقي $remainingSeats من ${activity.capacity}',
          ),
          if (activity.requiresGuardianConsent) ...[
            const SizedBox(height: AppSpacing.md),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.soft,
                borderRadius: BorderRadius.circular(AppRadius.lg),
              ),
              child: Text(
                activity.consentText.isEmpty
                    ? 'يتطلب هذا النشاط موافقة ولي الأمر عند التسجيل.'
                    : activity.consentText,
                style: textTheme.bodySmall,
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          FilledButton.icon(
            onPressed: null,
            icon: const Icon(Icons.how_to_reg_rounded),
            label: const Text('التسجيل سيتم تفعيله في الخطوة القادمة'),
          ),
        ],
      ),
    );
  }

  int _remainingSeats(ParentSchoolActivity activity) {
    final capacity = activity.capacity;

    if (capacity == null) return 0;

    final remaining = capacity - activity.registeredCount;

    if (remaining < 0) return 0;

    return remaining;
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(label: Text(label), visualDensity: VisualDensity.compact);
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: 8),
        SizedBox(width: 105, child: Text(label, style: textTheme.bodySmall)),
        Expanded(
          child: Text(
            value,
            style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}

class _StudentActivitiesBundle {
  const _StudentActivitiesBundle({
    required this.student,
    required this.activities,
  });

  final ParentStudentSummary student;
  final List<ParentSchoolActivity> activities;
}

String _activityKindLabel(String value) {
  switch (value) {
    case 'COMPETITION':
      return 'مسابقة';
    case 'EVENT':
      return 'فعالية';
    case 'TRIP':
      return 'رحلة';
    case 'CLUB':
      return 'نادي';
    case 'WORKSHOP':
      return 'ورشة';
    case 'CAMPAIGN':
      return 'حملة';
    case 'SPORTS':
      return 'رياضي';
    case 'CULTURAL':
      return 'ثقافي';
    case 'VOLUNTEERING':
      return 'تطوعي';
    case 'CEREMONY':
      return 'حفل';
    case 'OTHER':
      return 'أخرى';
    default:
      return value.isEmpty ? 'نشاط' : value;
  }
}

String _formatDateTime(int? value) {
  if (value == null || value <= 0) {
    return 'غير محدد';
  }

  final date = DateTime.fromMillisecondsSinceEpoch(value);

  final dateText =
      '${date.year}/${_twoDigits(date.month)}/${_twoDigits(date.day)}';
  final timeText = '${_twoDigits(date.hour)}:${_twoDigits(date.minute)}';

  return '$dateText - $timeText';
}

String _twoDigits(int value) {
  return value.toString().padLeft(2, '0');
}