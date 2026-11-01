import 'package:flutter/material.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_content_container.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../data/parent_announcements_service.dart';
import '../data/parent_school_activity.dart';
import '../../guardian/models/parent_student_summary.dart';

class ParentAnnouncementsScreen extends StatefulWidget {
  const ParentAnnouncementsScreen({super.key});

  @override
  State<ParentAnnouncementsScreen> createState() =>
      _ParentAnnouncementsScreenState();
}

class _ParentAnnouncementsScreenState extends State<ParentAnnouncementsScreen> {
  final _service = ParentAnnouncementsService();

  late Future<List<ParentAnnouncementEntry>> _future;

  String _registeringKey = '';

  Future<void> _registerInActivity(ParentAnnouncementEntry entry) async {
    final activity = entry.activity;

    final registerableStudents = entry.students
        .where((student) => !entry.isStudentRegistered(student.studentId))
        .toList();

    if (registerableStudents.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم التسجيل في هذا النشاط بالفعل')),
      );
      return;
    }

    ParentStudentSummary? selectedStudent;

    if (registerableStudents.length == 1) {
      selectedStudent = registerableStudents.first;
    } else {
      selectedStudent = await _chooseStudent(registerableStudents);
    }

    if (selectedStudent == null) return;

    final consentAccepted = await _confirmRegistration(entry);

    if (!consentAccepted) return;

    final key = '${activity.id}_${selectedStudent.studentId}';

    setState(() {
      _registeringKey = key;
    });

    try {
      final status = await _service.registerStudentInActivity(
        orgId: selectedStudent.orgId,
        activityId: activity.id,
        studentId: selectedStudent.studentId,
        guardianConsentAccepted: true,
      );

      if (!mounted) return;

      final message = status == 'WAITLISTED'
          ? 'تم تسجيل الطلب في قائمة الانتظار'
          : 'تم تسجيل الطالب في النشاط بنجاح';

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));

      await _reload();
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('تعذر التسجيل: $error')));
    } finally {
      if (mounted) {
        setState(() {
          _registeringKey = '';
        });
      }
    }
  }

  Future<ParentStudentSummary?> _chooseStudent(
    List<ParentStudentSummary> students,
  ) async {
    return showModalBottomSheet<ParentStudentSummary>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          child: ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: students.length,
            separatorBuilder: (_, _) => const Divider(),
            itemBuilder: (context, index) {
              final student = students[index];

              return ListTile(
                leading: const CircleAvatar(
                  child: Icon(Icons.child_care_rounded),
                ),
                title: Text(student.studentName),
                subtitle: Text(student.classLine),
                onTap: () => Navigator.of(context).pop(student),
              );
            },
          ),
        );
      },
    );
  }

  Future<bool> _confirmRegistration(ParentAnnouncementEntry entry) async {
    final activity = entry.activity;

    return await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text('تأكيد التسجيل'),
              content: Text(
                activity.requiresGuardianConsent
                    ? activity.consentText
                    : 'هل تريد تسجيل الطالب في هذا النشاط؟',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('إلغاء'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('تأكيد التسجيل'),
                ),
              ],
            );
          },
        ) ??
        false;
  }

  @override
  void initState() {
    super.initState();
    _future = _service.loadAnnouncements();
  }

  Future<void> _reload() async {
    final nextFuture = _service.loadAnnouncements();
    setState(() {
      _future = nextFuture;
    });

    try {
      await nextFuture;
    } catch (_) {
      // FutureBuilder displays the loading error in the screen.
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ParentAnnouncementEntry>>(
      future: _future,
      builder: (context, snapshot) {
        return Scaffold(
          backgroundColor: Colors.transparent,
          body: SafeArea(
            top: false,
            child: AppContentContainer(child: _buildBody(snapshot)),
          ),
        );
      },
    );
  }

  Widget _buildBody(AsyncSnapshot<List<ParentAnnouncementEntry>> snapshot) {
    if (snapshot.connectionState == ConnectionState.waiting) {
      return const AppLoadingState(message: 'جاري تحميل الإعلانات والأنشطة...');
    }

    if (snapshot.hasError) {
      return AppErrorState(
        title: 'تعذر تحميل الإعلانات والأنشطة',
        message: snapshot.error.toString(),
        onRetry: _reload,
      );
    }

    final entries = snapshot.data ?? [];

    if (entries.isEmpty) {
      return AppEmptyState(
        icon: Icons.campaign_outlined,
        title: 'لا توجد إعلانات أو أنشطة',
        message: 'لا توجد أنشطة مفتوحة أو إعلانات متاحة حاليًا.',
        action: OutlinedButton.icon(
          onPressed: _reload,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('تحديث'),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.md,
          AppSpacing.lg,
          AppSpacing.xxl,
        ),
        itemCount: entries.length + 1,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, index) {
          if (index == 0) {
            return const _PageIntroCard();
          }

          final entry = entries[index - 1];

          return _AnnouncementActivityCard(
            entry: entry,
            registeringKey: _registeringKey,
            onRegister: () => _registerInActivity(entry),
          );
        },
      ),
    );
  }
}

class _PageIntroCard extends StatelessWidget {
  const _PageIntroCard();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final palette = context.appPalette;

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: palette.gold.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: Icon(
              Icons.auto_awesome_rounded,
              color: palette.gold,
              size: 30,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'مساحتك لمتابعة كل جديد',
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'الإعلانات والأنشطة والنتائج المهمة لأبنائك مرتبة في مكان واحد.',
                  style: textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
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

class _AnnouncementActivityCard extends StatelessWidget {
  const _AnnouncementActivityCard({
    required this.entry,
    required this.registeringKey,
    required this.onRegister,
  });

  final ParentAnnouncementEntry entry;
  final String registeringKey;
  final VoidCallback onRegister;

  @override
  Widget build(BuildContext context) {
    final activity = entry.activity;
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    final canRegister =
        activity.status == 'REGISTRATION_OPEN' &&
        !entry.allTargetedStudentsRegistered &&
        registeringKey.isEmpty &&
        !entry.hasResult;

    final studentNames = entry.students.map((student) => student.studentName);
    final schools = entry.students
        .map((student) => student.schoolName)
        .where((name) => name.isNotEmpty)
        .toSet()
        .toList();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: colorScheme.secondary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                ),
                child: Icon(
                  _activityIcon(activity.activityKind),
                  color: colorScheme.secondary,
                ),
              ),
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
                        color: colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              _StatusChip(
                label: _activityStatusLabel(
                  activity.status,
                  hasResult: entry.hasResult,
                ),
                highlighted:
                    activity.status == 'REGISTRATION_OPEN' && !entry.hasResult,
              ),
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
              style: textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          _InfoRow(
            icon: Icons.child_care_rounded,
            label: 'متاح لـ',
            value: studentNames.join('، '),
          ),

          if (entry.registrationStatusByStudentId.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            _InfoRow(
              icon: Icons.verified_rounded,
              label: 'حالة التسجيل',
              value: _registrationStatusText(entry),
            ),
          ],

          if (entry.resultByStudentId.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            _InfoRow(
              icon: Icons.emoji_events_rounded,
              label: 'النتيجة',
              value: _activityResultText(entry),
            ),
          ],

          const SizedBox(height: AppSpacing.sm),
          _InfoRow(
            icon: Icons.school_rounded,
            label: 'المدرسة',
            value: schools.isEmpty ? 'غير محددة' : schools.join('، '),
          ),
          const SizedBox(height: AppSpacing.sm),
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
            value: _seatsText(activity),
          ),
          if (activity.requiresGuardianConsent) ...[
            const SizedBox(height: AppSpacing.md),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: colorScheme.primaryContainer.withValues(alpha: 0.36),
                borderRadius: BorderRadius.circular(AppRadius.lg),
                border: Border.all(
                  color: colorScheme.primary.withValues(alpha: 0.15),
                ),
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
            onPressed: canRegister ? onRegister : null,
            icon: registeringKey.isEmpty
                ? Icon(
                    entry.hasResult
                        ? Icons.emoji_events_rounded
                        : entry.allTargetedStudentsRegistered
                        ? Icons.check_circle_rounded
                        : Icons.how_to_reg_rounded,
                  )
                : const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
            label: Text(
              registeringKey.isNotEmpty
                  ? 'جاري التسجيل...'
                  : entry.hasResult
                  ? 'تم إعلان النتيجة'
                  : entry.allTargetedStudentsRegistered
                  ? 'تم التسجيل'
                  : activity.status == 'REGISTRATION_OPEN'
                  ? 'تسجيل في النشاط'
                  : 'انتهى التسجيل',
            ),
          ),
        ],
      ),
    );
  }

  String _seatsText(ParentSchoolActivity activity) {
    final capacity = activity.capacity;

    if (capacity == null) {
      return 'غير محددة';
    }

    final remaining = capacity - activity.registeredCount;

    return 'المتبقي ${remaining < 0 ? 0 : remaining} من $capacity';
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, this.highlighted = false});

  final String label;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: highlighted
            ? colorScheme.primary.withValues(alpha: 0.14)
            : colorScheme.surfaceContainerHighest.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(
          color: highlighted
              ? colorScheme.primary.withValues(alpha: 0.28)
              : colorScheme.outlineVariant,
        ),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: highlighted
              ? colorScheme.primary
              : colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
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
        SizedBox(width: 90, child: Text(label, style: textTheme.bodySmall)),
        Expanded(
          child: Text(
            value.isEmpty ? 'غير محدد' : value,
            style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
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

String _activityStatusLabel(String status, {required bool hasResult}) {
  if (hasResult) return 'النتيجة متاحة';

  switch (status) {
    case 'REGISTRATION_OPEN':
      return 'التسجيل مفتوح';
    case 'REGISTRATION_CLOSED':
      return 'انتهى التسجيل';
    case 'IN_PROGRESS':
      return 'النشاط قائم';
    case 'COMPLETED':
      return 'مكتمل';
    case 'CANCELLED':
      return 'ملغي';
    default:
      return 'نشاط مدرسي';
  }
}

IconData _activityIcon(String value) {
  switch (value) {
    case 'COMPETITION':
      return Icons.emoji_events_rounded;
    case 'TRIP':
      return Icons.directions_bus_rounded;
    case 'SPORTS':
      return Icons.sports_soccer_rounded;
    case 'CULTURAL':
      return Icons.theater_comedy_rounded;
    case 'VOLUNTEERING':
      return Icons.volunteer_activism_rounded;
    case 'CEREMONY':
      return Icons.celebration_rounded;
    default:
      return Icons.campaign_rounded;
  }
}

String _registrationStatusText(ParentAnnouncementEntry entry) {
  final parts = <String>[];

  for (final student in entry.students) {
    final status = entry.registrationStatusByStudentId[student.studentId];

    if (status == null || status.isEmpty) continue;

    parts.add('${student.studentName}: ${_registrationStatusLabel(status)}');
  }

  return parts.join('، ');
}

String _registrationStatusLabel(String status) {
  switch (status) {
    case 'CONFIRMED':
      return 'تم التسجيل';
    case 'WAITLISTED':
      return 'قائمة الانتظار';
    case 'REQUESTED':
      return 'تم إرسال الطلب';
    case 'PENDING':
      return 'بانتظار المراجعة';
    case 'REJECTED':
      return 'مرفوض';
    default:
      return status;
  }
}

String _activityResultText(ParentAnnouncementEntry entry) {
  final parts = <String>[];

  for (final student in entry.students) {
    final result = entry.resultByStudentId[student.studentId];

    if (result == null) continue;

    final title = result.title.isEmpty
        ? _activityResultTypeLabel(result.resultType)
        : result.title;

    parts.add('${student.studentName}: $title');
  }

  return parts.join('، ');
}

String _activityResultTypeLabel(String value) {
  switch (value) {
    case 'WINNER':
      return 'فائز';
    case 'RANKED':
      return 'مركز';
    case 'PARTICIPATION':
      return 'مشاركة';
    case 'HONORABLE_MENTION':
      return 'تميز';
    case 'NOTE':
      return 'ملاحظة';
    default:
      return value.isEmpty ? 'نتيجة' : value;
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
