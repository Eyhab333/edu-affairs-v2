import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../../guardian/data/guardian_children_service.dart';
import '../../guardian/models/parent_student_summary.dart';
import '../../messages/data/parent_message_thread.dart';
import '../../messages/data/parent_messages_service.dart';
import '../../messages/data/student_communication_target.dart';

class StudentCommunicationScreen extends StatefulWidget {
  const StudentCommunicationScreen({required this.studentId, super.key});

  final String studentId;

  @override
  State<StudentCommunicationScreen> createState() =>
      _StudentCommunicationScreenState();
}

class _StudentCommunicationScreenState
    extends State<StudentCommunicationScreen> {
  final _childrenService = GuardianChildrenService();
  final _messagesService = ParentMessagesService();

  late Future<ParentStudentSummary?> _future;

  Future<List<StudentCommunicationTarget>>? _targetsFuture;
  String _targetsStudentId = '';
  String _openingTargetId = '';

  @override
  void initState() {
    super.initState();
    _future = _loadStudent();
  }

  Future<ParentStudentSummary?> _loadStudent() async {
    final children = await _childrenService.loadMyChildren();

    for (final child in children) {
      if (child.studentId == widget.studentId) {
        return child;
      }
    }

    return null;
  }

  void _reload() {
    setState(() {
      _future = _loadStudent();
      _targetsFuture = null;
      _targetsStudentId = '';
    });
  }

  Future<List<StudentCommunicationTarget>> _getTargetsFuture(
    ParentStudentSummary student,
  ) {
    if (_targetsFuture != null && _targetsStudentId == student.studentId) {
      return _targetsFuture!;
    }

    _targetsStudentId = student.studentId;
    _targetsFuture = _messagesService.getStudentCommunicationTargets(
      student: student,
    );

    return _targetsFuture!;
  }

  void _refreshTargets(ParentStudentSummary student) {
    setState(() {
      _targetsStudentId = student.studentId;
      _targetsFuture = _messagesService.getStudentCommunicationTargets(
        student: student,
      );
    });
  }

  Future<void> _openTargetThread({
    required ParentStudentSummary student,
    required StudentCommunicationTarget target,
  }) async {
    if (_openingTargetId.isNotEmpty) return;

    setState(() {
      _openingTargetId = target.id;
    });

    try {
      final threadId = await _messagesService.createOrGetStudentContextThread(
        student: student,
        target: target,
      );

      if (!mounted) return;

      context.push('/messages/${Uri.encodeComponent(threadId)}');
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('تعذر فتح المحادثة: $error')));
    } finally {
      if (mounted) {
        setState(() {
          _openingTargetId = '';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ParentStudentSummary?>(
      future: _future,
      builder: (context, snapshot) {
        final student = snapshot.data;

        return Scaffold(
          appBar: AppBar(
            title: Text(
              student == null ? 'التواصل' : 'التواصل - ${student.studentName}',
            ),
            centerTitle: true,
          ),
          body: SafeArea(child: _buildBody(context, snapshot)),
        );
      },
    );
  }

  Widget _buildBody(
    BuildContext context,
    AsyncSnapshot<ParentStudentSummary?> snapshot,
  ) {
    if (snapshot.connectionState == ConnectionState.waiting) {
      return const AppLoadingState(message: 'جاري تحميل بيانات التواصل...');
    }

    if (snapshot.hasError) {
      return AppErrorState(
        title: 'تعذر تحميل صفحة التواصل',
        message: snapshot.error.toString(),
        onRetry: _reload,
      );
    }

    final student = snapshot.data;

    if (student == null) {
      return AppEmptyState(
        icon: Icons.lock_outline_rounded,
        title: 'لا يمكن فتح التواصل',
        message: 'هذا الطالب غير مرتبط بحساب ولي الأمر الحالي.',
        action: OutlinedButton.icon(
          onPressed: () => context.go('/children'),
          icon: const Icon(Icons.arrow_back_rounded),
          label: const Text('العودة إلى أبنائي'),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        _StudentCommunicationHeader(student: student),
        const SizedBox(height: AppSpacing.lg),

        _SectionTitle(
          icon: Icons.forum_rounded,
          title: 'محادثات هذا الطالب',
          subtitle: 'كل المحادثات المرتبطة بهذا الابن فقط.',
        ),
        const SizedBox(height: AppSpacing.sm),

        StreamBuilder<List<ParentMessageThread>>(
          stream: _messagesService.watchStudentThreads(student.studentId),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return AppCard(
                child: Text(
                  'تعذر تحميل المحادثات: ${snapshot.error}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              );
            }

            if (snapshot.connectionState == ConnectionState.waiting) {
              return const AppCard(
                child: Padding(
                  padding: EdgeInsets.all(AppSpacing.md),
                  child: Center(child: CircularProgressIndicator()),
                ),
              );
            }

            final threads = snapshot.data ?? const [];

            if (threads.isEmpty) {
              return const AppCard(
                child: Padding(
                  padding: EdgeInsets.all(AppSpacing.md),
                  child: Text(
                    'لا توجد محادثات لهذا الطالب بعد.',
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            return Column(
              children: [
                for (final thread in threads) ...[
                  _ExistingThreadCard(thread: thread),
                  const SizedBox(height: AppSpacing.sm),
                ],
              ],
            );
          },
        ),

        const SizedBox(height: AppSpacing.xl),

        _SectionTitle(
          icon: Icons.add_comment_rounded,
          title: 'ابدأ محادثة جديدة',
          subtitle: 'اختر الجهة المناسبة للتواصل بخصوص هذا الطالب.',
        ),
        const SizedBox(height: AppSpacing.sm),

        _CommunicationTargetsSection(
          targetsFuture: _getTargetsFuture(student),
          openingTargetId: _openingTargetId,
          onRefresh: () => _refreshTargets(student),
          onTargetTap: (target) {
            _openTargetThread(student: student, target: target);
          },
        ),
      ],
    );
  }
}

class _StudentCommunicationHeader extends StatelessWidget {
  const _StudentCommunicationHeader({required this.student});

  final ParentStudentSummary student;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppCard(
      child: Row(
        children: [
          CircleAvatar(
            radius: 28,
            child: Text(
              student.studentName.trim().isEmpty
                  ? 'ط'
                  : student.studentName.characters.first,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  student.studentName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  student.schoolName.isEmpty
                      ? 'لم يتم تحديد المدرسة'
                      : student.schoolName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.mutedText,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  student.classLine,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.mutedText,
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

class _ExistingThreadCard extends StatelessWidget {
  const _ExistingThreadCard({required this.thread});

  final ParentMessageThread thread;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasUnread = thread.unreadCount > 0;

    return AppCard(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        onTap: () {
          context.push('/messages/${Uri.encodeComponent(thread.id)}');
        },
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Row(
            children: [
              CircleAvatar(
                child: Text(
                  thread.otherDisplayName.trim().isEmpty
                      ? 'م'
                      : thread.otherDisplayName.characters.first,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      thread.otherDisplayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      thread.lastMessageSummary.isEmpty
                          ? 'لم تبدأ المحادثة بعد'
                          : thread.lastMessageSummary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.mutedText,
                      ),
                    ),
                  ],
                ),
              ),
              if (hasUnread)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    '${thread.unreadCount}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onPrimary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CommunicationTargetCard extends StatelessWidget {
  const _CommunicationTargetCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.loading,
    required this.onTap,
    this.disabled = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool loading;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppCard(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        onTap: disabled || loading ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: disabled
                      ? theme.colorScheme.surfaceContainerHighest
                      : theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                ),
                child: Icon(
                  icon,
                  color: disabled
                      ? theme.colorScheme.onSurfaceVariant
                      : theme.colorScheme.primary,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.mutedText,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              if (loading)
                const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Icon(
                  Icons.chevron_right_rounded,
                  color: disabled
                      ? theme.colorScheme.onSurfaceVariant
                      : theme.colorScheme.primary,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: theme.colorScheme.primary),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.mutedText,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CommunicationTargetsSection extends StatelessWidget {
  const _CommunicationTargetsSection({
    required this.targetsFuture,
    required this.openingTargetId,
    required this.onRefresh,
    required this.onTargetTap,
  });

  final Future<List<StudentCommunicationTarget>> targetsFuture;
  final String openingTargetId;
  final VoidCallback onRefresh;
  final ValueChanged<StudentCommunicationTarget> onTargetTap;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<StudentCommunicationTarget>>(
      future: targetsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const AppCard(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.md),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        if (snapshot.hasError) {
          return AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'تعذر تحميل جهات التواصل: ${snapshot.error}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                OutlinedButton.icon(
                  onPressed: onRefresh,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('إعادة المحاولة'),
                ),
              ],
            ),
          );
        }

        final targets = snapshot.data ?? const [];

        if (targets.isEmpty) {
          return const AppCard(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.md),
              child: Text(
                'لا توجد جهات تواصل متاحة لهذا الطالب حاليًا.',
                textAlign: TextAlign.center,
              ),
            ),
          );
        }

        final schoolTargets = targets
            .where((target) => target.targetKind == 'SCHOOL_ADMIN')
            .toList();

        final teacherTargets = targets.where((target) {
          return target.targetKind == 'CLASS_TEACHER' ||
              target.targetKind == 'SUBJECT_TEACHER';
        }).toList();

        final otherTargets = targets.where((target) {
          return target.targetKind != 'SCHOOL_ADMIN' &&
              target.targetKind != 'CLASS_TEACHER' &&
              target.targetKind != 'SUBJECT_TEACHER';
        }).toList();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (schoolTargets.isNotEmpty) ...[
              _TargetGroupTitle(title: 'إدارة المدرسة'),
              const SizedBox(height: AppSpacing.sm),
              for (final target in schoolTargets) ...[
                _CommunicationTargetCard(
                  icon: Icons.apartment_rounded,
                  title: target.title,
                  subtitle: target.subtitle,
                  loading: openingTargetId == target.id,
                  onTap: () => onTargetTap(target),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
            ],

            if (teacherTargets.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              _TargetGroupTitle(title: 'معلمو ابني'),
              const SizedBox(height: AppSpacing.sm),
              for (final target in teacherTargets) ...[
                _CommunicationTargetCard(
                  icon: target.targetKind == 'CLASS_TEACHER'
                      ? Icons.person_rounded
                      : Icons.menu_book_rounded,
                  title: target.title,
                  subtitle: target.subtitle,
                  loading: openingTargetId == target.id,
                  onTap: () => onTargetTap(target),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
            ],

            if (otherTargets.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              _TargetGroupTitle(title: 'جهات أخرى'),
              const SizedBox(height: AppSpacing.sm),
              for (final target in otherTargets) ...[
                _CommunicationTargetCard(
                  icon: Icons.forum_rounded,
                  title: target.title,
                  subtitle: target.subtitle,
                  loading: openingTargetId == target.id,
                  onTap: () => onTargetTap(target),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
            ],

            _CommunicationTargetCard(
              icon: Icons.psychology_alt_rounded,
              title: 'المرشد الطلابي',
              subtitle: 'سيتم تفعيلها لاحقًا ضمن خدمات الطالب.',
              loading: false,
              disabled: true,
              onTap: () {},
            ),
          ],
        );
      },
    );
  }
}

class _TargetGroupTitle extends StatelessWidget {
  const _TargetGroupTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Text(
      title,
      style: theme.textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w900,
        color: AppColors.mutedText,
      ),
    );
  }
}
