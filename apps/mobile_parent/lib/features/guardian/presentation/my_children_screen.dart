import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_content_container.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../data/guardian_children_service.dart';
import '../models/parent_student_summary.dart';

class MyChildrenScreen extends StatefulWidget {
  const MyChildrenScreen({super.key});

  @override
  State<MyChildrenScreen> createState() => _MyChildrenScreenState();
}

class _MyChildrenScreenState extends State<MyChildrenScreen> {
  final GuardianChildrenService _service = GuardianChildrenService();
  late Future<List<ParentStudentSummary>> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.loadMyChildren();
  }

  Future<void> _reload() async {
    final nextFuture = _service.loadMyChildren();
    setState(() {
      _future = nextFuture;
    });

    try {
      await nextFuture;
    } catch (_) {
      // FutureBuilder displays the loading error in the screen.
    }
  }

  void _openStudent(ParentStudentSummary student) {
    context.push('/students/${Uri.encodeComponent(student.studentId)}');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        top: false,
        child: AppContentContainer(
          child: FutureBuilder<List<ParentStudentSummary>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const AppLoadingState(
                message: 'جاري تحميل بيانات الأبناء...',
              );
            }

            if (snapshot.hasError) {
              return AppErrorState(
                title: 'تعذر تحميل بيانات الأبناء',
                message: snapshot.error.toString(),
                onRetry: _reload,
              );
            }

            final children = snapshot.data ?? const <ParentStudentSummary>[];
            if (children.isEmpty) {
              return AppEmptyState(
                icon: Icons.family_restroom_outlined,
                title: 'لا يوجد أبناء مرتبطون بالحساب',
                message:
                    'لم نجد روابط أبناء نشطة لهذا الحساب. تواصل مع إدارة المدرسة إذا كنت تتوقع ظهور طالب هنا.',
                action: OutlinedButton.icon(
                  onPressed: _reload,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('إعادة المحاولة'),
                ),
              );
            }

            return RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.md,
                  AppSpacing.lg,
                  AppSpacing.xxl,
                ),
                children: [
                  _GuardianGreeting(childrenCount: children.length),
                  const SizedBox(height: AppSpacing.xl),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'ملفات الأبناء',
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w900,
                              ),
                        ),
                      ),
                      Text(
                        'اسحب للتحديث',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'اختر أحد الأبناء لفتح ملفه ومتابعة تفاصيله.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  for (final student in children)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: _StudentCard(
                        student: student,
                        onTap: () => _openStudent(student),
                      ),
                    ),
                ],
              ),
            );
          },
          ),
        ),
      ),
    );
  }
}

class _GuardianGreeting extends StatelessWidget {
  const _GuardianGreeting({required this.childrenCount});

  final int childrenCount;

  @override
  Widget build(BuildContext context) {
    final guardianName =
        FirebaseAuth.instance.currentUser?.displayName?.trim() ?? '';
    final theme = Theme.of(context);

    return AppCard(
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: Icon(
              Icons.waving_hand_rounded,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'مرحبًا بك',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (guardianName.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    guardianName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Text(
              '$childrenCount ${childrenCount == 1 ? 'طالب' : 'طلاب'}',
              style: theme.textTheme.labelMedium?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StudentCard extends StatelessWidget {
  const _StudentCard({required this.student, required this.onTap});

  final ParentStudentSummary student;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = context.appPalette;

    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                ),
                child: Icon(
                  Icons.school_rounded,
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      student.studentName,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      student.schoolName.isEmpty
                          ? 'لم تُحدد المدرسة بعد'
                          : student.schoolName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              _RelationBadge(
                label: student.relationLabel,
                color: palette.gold,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Divider(color: palette.glassBorder, height: 1),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _StudentMeta(
                  icon: Icons.class_rounded,
                  label: 'الصف والفصل',
                  value: student.classLine,
                ),
              ),
              if (student.academicYearTitle.isNotEmpty) ...[
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: _StudentMeta(
                    icon: Icons.calendar_month_rounded,
                    label: 'العام الدراسي',
                    value: student.academicYearTitle,
                  ),
                ),
              ],
              const SizedBox(width: AppSpacing.sm),
              Icon(
                Icons.chevron_left_rounded,
                color: theme.colorScheme.primary,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StudentMeta extends StatelessWidget {
  const _StudentMeta({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 17, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 7),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RelationBadge extends StatelessWidget {
  const _RelationBadge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
