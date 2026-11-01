import 'package:flutter/material.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../../../shared/widgets/app_section_title.dart';
import '../data/student_notes_service.dart';
import '../models/student_notes_summary.dart';

class StudentNotesTab extends StatefulWidget {
  const StudentNotesTab({
    super.key,
    required this.studentId,
  });

  final String studentId;

  @override
  State<StudentNotesTab> createState() => _StudentNotesTabState();
}

class _StudentNotesTabState extends State<StudentNotesTab> {
  late Future<StudentNotesSummary> _future;

  final _service = StudentNotesService();

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<StudentNotesSummary> _load() {
    return _service.loadStudentNotes(studentId: widget.studentId);
  }

  void _reload() {
    setState(() {
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<StudentNotesSummary>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const AppLoadingState(message: 'جاري تحميل الملاحظات...');
        }

        if (snapshot.hasError) {
          return AppErrorState(
            title: 'تعذر تحميل الملاحظات',
            message: snapshot.error.toString(),
            onRetry: _reload,
          );
        }

        final summary = snapshot.data;

        if (summary == null || summary.isEmpty) {
          return AppEmptyState(
            icon: Icons.sticky_note_2_rounded,
            title: 'لا توجد ملاحظات ظاهرة',
            message:
                'لا توجد ملاحظات مسموح عرضها لولي الأمر لهذا الطالب حتى الآن.',
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
              _LatestNoteCard(summary: summary),
              const SizedBox(height: AppSpacing.md),
              _CountersGrid(summary: summary),
              const SizedBox(height: AppSpacing.lg),
              const AppSectionTitle(
                title: 'الملاحظات الظاهرة لولي الأمر',
                subtitle:
                    'لا تظهر هنا إلا الملاحظات التي تم السماح بعرضها لولي الأمر.',
                icon: Icons.sticky_note_2_rounded,
              ),
              const SizedBox(height: AppSpacing.md),
              ...summary.items.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: _NoteItemCard(item: item),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _LatestNoteCard extends StatelessWidget {
  const _LatestNoteCard({
    required this.summary,
  });

  final StudentNotesSummary summary;

  @override
  Widget build(BuildContext context) {
    final latest = summary.latestItem;
    final textTheme = Theme.of(context).textTheme;

    if (latest == null) {
      return const SizedBox.shrink();
    }

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _NoteIcon(item: latest),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'آخر ملاحظة',
                  style: textTheme.bodySmall?.copyWith(
                    color: AppColors.mutedText,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  latest.title,
                  style: textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  latest.dateLabel,
                  style: textTheme.bodySmall?.copyWith(
                    color: AppColors.mutedText,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          _SmallBadge(label: '${summary.totalCount} ملاحظات'),
        ],
      ),
    );
  }
}

class _CountersGrid extends StatelessWidget {
  const _CountersGrid({
    required this.summary,
  });

  final StudentNotesSummary summary;

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
          label: 'إجمالي',
          value: summary.totalCount,
          icon: Icons.notes_rounded,
        ),
        _CounterCard(
          label: 'إيجابية',
          value: summary.positiveCount,
          icon: Icons.emoji_events_rounded,
        ),
        _CounterCard(
          label: 'تعليمية',
          value: summary.academicCount,
          icon: Icons.menu_book_rounded,
        ),
        _CounterCard(
          label: 'تحتاج متابعة',
          value: summary.followUpCount,
          icon: Icons.flag_rounded,
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
                    color: AppColors.mutedText,
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

class _NoteItemCard extends StatelessWidget {
  const _NoteItemCard({
    required this.item,
  });

  final StudentNoteItem item;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _NoteIcon(item: item),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      item.title,
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    _SmallBadge(label: item.noteTypeLabel),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  item.body.isEmpty ? 'لا يوجد نص للملاحظة' : item.body,
                  style: textTheme.bodyMedium?.copyWith(
                    height: 1.6,
                    color: Theme.of(context).colorScheme.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _MutedBadge(label: item.dateLabel),
                    _MutedBadge(label: item.severityLabel),
                    _MutedBadge(label: item.followUpLabel),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NoteIcon extends StatelessWidget {
  const _NoteIcon({
    required this.item,
  });

  final StudentNoteItem item;

  @override
  Widget build(BuildContext context) {
    final info = _noteInfo(item);

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

  _NoteInfo _noteInfo(StudentNoteItem item) {
    if (item.needsFollowUp) {
      return const _NoteInfo(
        icon: Icons.flag_rounded,
        color: Color(0xFFD97706),
      );
    }

    if (item.isPositive) {
      return const _NoteInfo(
        icon: Icons.emoji_events_rounded,
        color: Color(0xFF15803D),
      );
    }

    if (item.isAcademic) {
      return const _NoteInfo(
        icon: Icons.menu_book_rounded,
        color: Color(0xFF2563EB),
      );
    }

    return const _NoteInfo(
      icon: Icons.sticky_note_2_rounded,
      color: Color(0xFF64748B),
    );
  }
}

class _SmallBadge extends StatelessWidget {
  const _SmallBadge({
    required this.label,
  });

  final String label;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 10,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: AppColors.soft,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        label,
        style: textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _MutedBadge extends StatelessWidget {
  const _MutedBadge({
    required this.label,
  });

  final String label;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 9,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        label,
        style: textTheme.labelSmall?.copyWith(
          color: AppColors.mutedText,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _NoteInfo {
  const _NoteInfo({
    required this.icon,
    required this.color,
  });

  final IconData icon;
  final Color color;
}
